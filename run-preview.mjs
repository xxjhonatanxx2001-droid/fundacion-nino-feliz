process.env.VITE_SUPABASE_URL = 'https://supabase-api-prod.verdent.ai/p/pe87fa659614b6537cafa';
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoyMTA3OTYwMzg4LCJpYXQiOjE3OTIzNDExODgsImlzcyI6InN1cGFiYXNlIiwicHJvamVjdF9yZWYiOiJwZTg3ZmE2NTk2MTRiNjUzN2NhZmEiLCJyb2xlIjoiYW5vbiJ9.kOVs8ITsWHUTPu5e-lWI3DRYY7zSooTKT_hjftLNfw0';
process.env.PORT = '8091';
await import('./server/index.js');
