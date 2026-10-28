# 원본의 밝은 피부톤 적용

사용자가 선택원본의 피부가 더밝다고 지적하며 그밝은색을 현재캐릭터에 적용하도록 요청했습니다. v9의 피부기본 #fac9b0 대신, 같은원본에서추출한 피부팔레트중가장밝은 #fcdcc1을 기본색으로사용합니다. 옅은단계는 #fbd6bb입니다. 별도색을추가하거나원본팔레트32색을다시추출하지않습니다.

얼굴/노출피부영역에서기존피부재질색21~25만다시등록합니다. 눈색/외곽선/자세/스프라이트크기/전신실루엣/상체움직임은유지합니다. 머리윗부분과발끝은피부보정범위에서제외했습니다. 실제PixelPen네이티브API로25프로젝트152프레임을수정·저장·재열기·PNG출력했습니다. 이번최종영역보정의실제변경은16669도트입니다. 다른재질색변경0,홍채도트변경0,알파변경0은skin-audit.json에있습니다.

원본은pixelpen/이며native-frames/는실제PixelPen출력입니다. 실제저장본의변경전후는preview/skin-before-after-front.png에서볼수있습니다. 계획도트는plans/에보존합니다. v9원본은덮어쓰지않습니다.

일반수동반영:python scripts/sync-heroine-fullbody.py --source reference-bright-v10 --export heroine-reference-bright-v10

plan-heroine-bright-skin.py와네이티브패치는최초보정용이므로수동저장후다시원본에덮어쓰지마십시오. 게임/웹반영범위는PRODUCTION.md최신기록을따릅니다. 열린브라우저/사용자저장은조작하지않습니다.