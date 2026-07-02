3050 Preview Generator FINAL

핵심 수정
- 팀 로스터는 반드시 팀 구글시트의 S11Roaster 탭만 읽습니다.
  Sheet ID: 1othAdoPUHvxo5yDKmEZSGH-cjslR1WyV90F7FdU30OE
- 로컬 team_rosters.json을 제거했습니다. 팀/선수 로스터 예비값을 사용하지 않습니다.
- 선수 기본 DB는 3050 ELO 구글시트의 '클랜원 전체명단' 또는 '클랜원전체명단' 탭에서 읽습니다.
  Sheet ID: 1F6Ey-whXAsTSMCWVmfexGd77jj6WDgv6Z7hkK3BHahs
- ELO/티어/종족은 ELOrank에서 읽습니다. ELOrankboard는 사용하지 않습니다.
- 최근 10경기는 '(개인전)경기기록데이터'를 우선 읽고, ELOResult/S11PlayerResult를 보조로 시도합니다.
- 공식 맵명 '애티튜드' 유지. MapDATA 탭도 읽기 시도합니다.

실행
1. 실행_사이트.bat 실행
2. http://localhost:3050 접속
3. 구글시트 전체 동기화 클릭

주의
- 구글시트 접근권한이 '링크가 있는 사용자가 보기 가능'이어야 브라우저에서 CSV 읽기가 됩니다.


FINAL 수정: Bonobono/GGamBo 같은 bo 포함 선수명 필터 오류 수정, 종족전적/상대전적/맵전적 계산 표시, 템플릿 잔상 방지용 불투명 덮기 강화.

FINAL: 이미지 표시 좌표, 승자표기 HOME/AWAY, 종족전적 한줄 표시, 템플릿 잔상 보정.
