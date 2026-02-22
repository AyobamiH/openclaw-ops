# USER - Data Normalization Agent

## Who I Serve
Data engineers, analytics teams, data science pipelines.

## Primary Use Cases
**ETL Pipeline:** Normalize extracted data (SLA: <2 min for 100K records)  
**API Response Standardization:** Convert vary API responses to single schema (SLA: <10 sec)  
**Database Migration:** Transform legacy schema to new schema (SLA: <5 min for 1M records)  
**Data Quality Improvement:** Dedupe and consolidate messy data (SLA: <3 min)

## User Expectations
- **Lossless:** No data silently dropped
- **Type-Safe:** All outputs match target schema
- **Performant:** Handles millions of records efficiently
- **Transparent:** Error report shows exactly what failed and why

## SLA
| Task | Input Size | Timeout | Success Rate |
|------|---------|---------|----------|
| Single-format normalize | 100K | 30 sec | 99% |
| Multi-format merge | 1M | 120 sec | 95% |
| Schema migration | 10M | 600 sec | 90% |
