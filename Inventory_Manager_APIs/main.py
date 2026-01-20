from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Import all your routers
from routers import products, suppliers, locations, inventory, sales, system, users, analytics,integrations,analysis,reports,purchases
# Create the main FastAPI application
app = FastAPI()

# --- CORS Configuration (THE FIX) ---
origins = [
    "http://localhost:5173",      # Typical Vite Desktop URL
    "http://127.0.0.1:5173",      # Alternative Vite URL
    "*",                          # Allow all (Easiest for dev)
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# ------------------------------------

# "Plug in" all the routers
app.include_router(products.router)
app.include_router(suppliers.router)
app.include_router(locations.router)
app.include_router(inventory.router) 
app.include_router(sales.router)
app.include_router(users.router)
app.include_router(analytics.router)
app.include_router(integrations.router)
app.include_router(analysis.router)
app.include_router(system.router)
app.include_router(reports.router)
app.include_router(purchases.router)
@app.get("/")
def read_root():
    return {"message": "Welcome to the Inventory Management API"}