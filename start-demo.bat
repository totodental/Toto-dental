@echo off
cd /d "%~dp0"
echo Starting Toto Dental demo on http://127.0.0.1:3000
python -m http.server 3000
