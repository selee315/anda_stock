@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   ANDA 펀드 대시보드
echo ============================================
echo.
echo [1/2] 필요한 프로그램을 설치합니다 (처음 한 번만 시간이 걸립니다)...
python -m pip install -r requirements.txt
echo.
echo [2/2] 대시보드를 실행합니다.
echo 잠시 후 브라우저가 자동으로 열립니다.
echo 주소: http://127.0.0.1:5000
echo (종료하려면 이 검은 창에서 Ctrl+C 를 누르세요)
echo.
start "" cmd /c "timeout /t 4 /nobreak >nul && start http://127.0.0.1:5000"
python app.py
pause
