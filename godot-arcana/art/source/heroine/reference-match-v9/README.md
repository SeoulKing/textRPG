# 선택한 원본 시트와 PixelPen 수정본

## 기준

사용자가 이 대화에서 직접 확인하고 다시 지정한 원본은 art-studies/arcana-hero/white-bob-heroine/pixel-run-v1/run-sheet-draft.png입니다. 원본을 표시한 뒤 이 그림을 기준으로 현재캐릭터를 PixelPen에서 수정하라고 지시했습니다.

달리기는 원본 각셀의 완성된 전신자세를 사용합니다. 머리만 바꾼 v4이후 보정이나 인공 상체이동을 달리기에 다시 적용하지 않습니다. 그림의 몸·머리·팔·다리·옷을 분리해 새로 조립하지 않습니다. 원본의 서로 다른 자세 자체에 있는 자연스러운 머리/몸 움직임을 유지합니다.

캐릭터 그림을 셀별로 분리하고 투명잔여조각을 정리한 뒤 하나의 공통배율로96×136,발(48,116),64px/단위에 등록합니다. 방향별좌우오류를 막기 위해NW/W/SW는NE/E/SE의 완성된 전신을 발x48로반전합니다. 등록된원본은registered-reference/에보존하며원본시트자체를덮어쓰지않습니다.

## 원본 색 보존

이전고정팔레트가원본의피부색과보랏빛눈을탁하게줄였습니다. 32색예산은그대로두고원본에서공통색을다시추출했습니다. 기본형태20색/피부5색/보라눈3색/푸른의상2색/금장2색입니다. 얼굴전체를단색으로덮거나같은눈을복제하지않습니다. 대기·시전·벤치도동일팔레트를사용하며피부/홍채가금색이나회색으로잘못매칭되지않도록얼굴영역에재질범위를적용합니다. 이전에거부된코주변금색반점은다시연결하지않습니다.

원본의모든그라데이션RGB와게임32색이완전히동일하다는주장은하지않습니다. 비교이미지source-vs-pixelpen.png의왼쪽은등록한원본RGB,오른쪽은실제PixelPen저장출력입니다. game/world의공통LUT와조명은유지합니다.

## 실제 PixelPen 원본

pixelpen/25개프로젝트152프레임을설치된PixelPen1.1.4 ProjectPacker/IndexedColorImage/IndexedPalette API로수정했습니다. 원본대비도트/팔레트수정후저장·재열기·팔레트/도트검사·PNG출력을완료했습니다. native-frames/는실제PixelPen출력입니다. Python으로 .pxpenZIP을만든것을네이티브편집으로표시한결과가아닙니다. 마우스로모든도트를직접클릭했다는주장도하지않습니다.

plans/native-result.json은마지막증분배치기록입니다. 최초152프레임배치후방향보정된3클립24프레임만추가반영했습니다. 전체등록은native-package-audit.json,원본전신실루엣비교는reference-match-audit.json을따릅니다. 달리기64프레임의등록원본대비실루엣차이0,다른88자세의기존대비실루엣차이0입니다. 이것은형태등록증거이며최종미술승인을대신하지않습니다.

## 수동 수정과 게임 반영

PixelPen에서pixelpen/*.pxpen을열어수정한후아래명령으로동기화합니다.

python scripts/sync-heroine-fullbody.py --source reference-match-v9 --export heroine-reference-v9

이반영명령은registration.json의공통팔레트로저장본을읽습니다. 원래고정팔레트로되돌리지않습니다. plan-heroine-reference-match.py는초기제작용이므로수동저장후원본에다시실행하지마십시오. 이전v8/run-v1원본은보존합니다.

게임/편집용미리보기는heroine-reference-v9네아틀라스/SpriteFrames를사용합니다. 기존의다른의상fallback,이동/충돌/저장/스킬시각은유지합니다. 적용/실제장면출력/웹제공범위는PRODUCTION.md최신항목을따릅니다. 브라우저자동플레이는하지않습니다.