# 의학과 2학년 시간표 PWA

구글 시트(`시간표` 탭)를 실시간으로 읽어 엑셀 격자 그대로 보여주는 설치형 웹앱.

- **데이터**: Google Sheets API v4 `spreadsheets.get` + `includeGridData` (값·병합·배경색·글자 런 색까지)
- **외형**: 엑셀 격자 — 연강 병합, 3줄(과목/교수·과/초안자·검안자), 점심 그룹, 공강 빈칸, 글자색 시트 그대로(검정/빨강/파랑), 토 파랑·일 빨강
- **갱신**: 45초 폴링, 시트 수정 후 ~1분 내 반영. 오프라인 시 마지막 데이터/내장 스냅샷 표시
- **화면**: 넓으면 주간 격자, 좁으면(폰) 단일 요일 + 스와이프, 오늘/현재 교시 강조, 칸 탭 → 전체 텍스트

## 파일

| 파일 | 역할 |
|---|---|
| `index.html` / `styles.css` | 셸 + 엑셀 격자 스타일(레퍼런스 HTML과 동일) |
| `app.js` | CONFIG(시트ID·API키·폴링) + Sheets API 호출 + 그리드 파서 + 렌더러 |
| `sw.js` | 서비스 워커 — 셸 캐시 우선, API 네트워크 우선(실패 시 캐시) |
| `manifest.json`, `icon-*.png` | PWA 설치 |
| `data/snapshot.js` | v32 엑셀에서 추출한 Sheets API 모양 스냅샷 (키 미입력/완전 오프라인 폴백) |
| `tools/extract.ps1` | xlsx → snapshot.js 재추출 스크립트 |
| `tools/serve.ps1` | 로컬 미리보기 서버 (`powershell -File tools/serve.ps1` → http://localhost:8741) |

## 설정

`app.js` 상단 `CONFIG.API_KEY`에 키 입력 → 끝. 자세한 배포 절차는 [배포가이드.md](배포가이드.md).
