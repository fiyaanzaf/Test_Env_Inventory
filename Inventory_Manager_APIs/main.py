from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Import all your routers
from routers import products, suppliers, locations, inventory, sales, system, users, analytics,integrations,analysis,reports,purchases,loyalty,employee,b2b,khata,invoices,scanner_ws,variants,batches
# Create the main FastAPI application
app = FastAPI()

# --- CORS Configuration ---
# Allow ALL origins for LAN usage (Desktop, PWA preview, APK all use different ports/origins)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
app.include_router(loyalty.router)
app.include_router(employee.router)
app.include_router(b2b.router)
app.include_router(khata.router)
app.include_router(invoices.router)
app.include_router(scanner_ws.router)
app.include_router(variants.router)
app.include_router(batches.router)
@app.get("/")
def read_root():
    return {"message": "Welcome to the Inventory Management API"}