#!/bin/bash
pip install -r requirements.txt
gunicorn backend:app --bind 0.0.0.0:${PORT:-5000}
