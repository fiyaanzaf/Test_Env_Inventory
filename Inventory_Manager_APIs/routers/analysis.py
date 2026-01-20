from fastapi import APIRouter, HTTPException, Depends
from typing import Annotated, List, Optional
from pydantic import BaseModel
import pandas as pd
from mlxtend.frequent_patterns import apriori, association_rules
from datetime import datetime, timedelta, date
from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool
import os
from dotenv import load_dotenv

# Reuse security
from security import check_role, User

router = APIRouter(
    prefix="/api/v1/analysis",
    tags=["Data Science & Insights"]
)

load_dotenv()

def get_sqlalchemy_engine():
    db_url = os.getenv('DATABASE_URL')
    if not db_url:
        raise ValueError("DATABASE_URL not found")
    if db_url.startswith('postgresql://'):
        db_url = db_url.replace('postgresql://', 'postgresql+psycopg2://', 1)
    elif db_url.startswith('postgres://'):
        db_url = db_url.replace('postgres://', 'postgresql+psycopg2://', 1)
    
    engine = create_engine(db_url, poolclass=NullPool)
    return engine

# --- Response Models ---
class MarketBasketRule(BaseModel):
    if_buy: List[str]
    likely_to_buy: List[str]
    confidence: float
    lift: float

class ABCItem(BaseModel):
    product_name: str
    sku: str
    revenue: float
    category_rank: str

class CustomerSegment(BaseModel):
    customer_phone: str
    customer_name: str
    segment_name: str
    recency_days: int
    frequency_count: int
    monetary_value: float

# --- Endpoints ---

@router.get("/market_basket", response_model=List[MarketBasketRule])
def get_market_basket_analysis(
    current_user: Annotated[User, Depends(check_role("manager"))],
    start_date: Optional[date] = None,
    end_date: Optional[date] = None
):
    try:
        engine = get_sqlalchemy_engine()
        
        if not start_date:
            start_date = date.today() - timedelta(days=365)
        if not end_date:
            end_date = date.today()

        # NOTE: Using 'sales_order_items' (plural). If your DB is singular, remove the 's'.
        query = text("""
            SELECT so.id as order_id, p.name as product_name
            FROM sales_order_items soi
            JOIN sales_orders so ON soi.order_id = so.id
            JOIN products p ON soi.product_id = p.id
            WHERE so.status = 'completed'
            AND date(so.order_timestamp) BETWEEN :start_date AND :end_date
        """)
        
        df = pd.read_sql(query, engine, params={"start_date": start_date, "end_date": end_date})
        
        if df.empty: return []

        # One-Hot Encoding
        basket = (df.groupby(['order_id', 'product_name'])['product_name']
                  .count().unstack().reset_index().fillna(0)
                  .set_index('order_id'))
        basket = basket.astype(bool)

        # Apriori
        frequent_itemsets = apriori(basket, min_support=0.01, use_colnames=True)
        if frequent_itemsets.empty: return []

        rules = association_rules(frequent_itemsets, metric="lift", min_threshold=1)
        
        results = []
        seen_pairs = set()
        
        for _, row in rules.iterrows():
            antecedents = frozenset(row['antecedents'])
            consequents = frozenset(row['consequents'])
            
            pair = tuple(sorted([str(antecedents), str(consequents)]))
            if pair in seen_pairs: continue
            seen_pairs.add(pair)
            
            results.append({
                "if_buy": list(row['antecedents']),
                "likely_to_buy": list(row['consequents']),
                "confidence": round(row['confidence'], 2),
                "lift": round(row['lift'], 2)
            })
        
        results.sort(key=lambda x: x['lift'], reverse=True)
        return results[:20]

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/abc_classification", response_model=List[ABCItem])
def get_abc_analysis(
    current_user: Annotated[User, Depends(check_role("manager"))],
    start_date: Optional[date] = None,
    end_date: Optional[date] = None
):
    try:
        engine = get_sqlalchemy_engine()

        if not start_date: start_date = date.today() - timedelta(days=365)
        if not end_date: end_date = date.today()
        
        # UPDATE: Changed 'price_at_sale' to 'unit_price' to match DB migration
        query = text("""
            SELECT p.name, p.sku, SUM(soi.quantity * soi.unit_price) as revenue
            FROM sales_order_items soi
            JOIN products p ON soi.product_id = p.id
            JOIN sales_orders so ON soi.order_id = so.id
            WHERE so.status = 'completed'
            AND date(so.order_timestamp) BETWEEN :start_date AND :end_date
            GROUP BY p.id
            ORDER BY revenue DESC
        """)
        df = pd.read_sql(query, engine, params={"start_date": start_date, "end_date": end_date})
        
        if df.empty: return []

        total_revenue = df['revenue'].sum()
        df['cum_revenue'] = df['revenue'].cumsum()
        df['cum_perc'] = 100 * df['cum_revenue'] / total_revenue

        def classify(perc):
            if perc <= 80: return 'A'
            elif perc <= 95: return 'B'
            else: return 'C'
        
        df['class'] = df['cum_perc'].apply(classify)
        
        results = []
        for _, row in df.iterrows():
            results.append({
                "product_name": row['name'],
                "sku": row['sku'],
                "revenue": float(row['revenue']),
                "category_rank": row['class']
            })
        return results

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/customer_segments", response_model=List[CustomerSegment])
def get_customer_segments(
    current_user: Annotated[User, Depends(check_role("manager"))],
    start_date: Optional[date] = None,
    end_date: Optional[date] = None
):
    try:
        engine = get_sqlalchemy_engine()

        if not start_date: start_date = date.today() - timedelta(days=365)
        if not end_date: end_date = date.today()
        
        query = text("""
            SELECT 
                customer_phone, 
                MAX(customer_name) as name,
                MAX(order_timestamp) as last_order_date,
                COUNT(id) as frequency,
                SUM(total_amount) as monetary
            FROM sales_orders
            WHERE customer_phone IS NOT NULL
            AND status = 'completed'
            AND date(order_timestamp) BETWEEN :start_date AND :end_date
            GROUP BY customer_phone
        """)
        df = pd.read_sql(query, engine, params={"start_date": start_date, "end_date": end_date})
        
        if df.empty: return []

        now = datetime.now()
        df['last_order_date'] = pd.to_datetime(df['last_order_date']).dt.tz_localize(None)
        df['recency'] = (now - df['last_order_date']).dt.days

        def segment_customer(row):
            r, f, m = row['recency'], row['frequency'], row['monetary']
            if r <= 30 and f >= 5 and m >= 5000: return "VIP"
            if r <= 30 and f >= 2: return "Loyal Active"
            if r <= 90 and f == 1: return "New Customer"
            if r > 90 and m >= 2000: return "At Risk (High Value)"
            if r > 180: return "Lost"
            return "Standard"

        df['segment'] = df.apply(segment_customer, axis=1)

        results = []
        for _, row in df.iterrows():
            results.append({
                "customer_phone": row['customer_phone'],
                "customer_name": row['name'],
                "segment_name": row['segment'],
                "recency_days": int(row['recency']),
                "frequency_count": int(row['frequency']),
                "monetary_value": float(row['monetary'])
            })
        return results

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))