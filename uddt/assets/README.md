# web/assets — 우당탕탕 웹 대진표 이미지 자산 (2026-11-06, 디자인 담당)

원본 `poster/drafts/{A,B,C}.png`(1290×1818)와 `poster/ref/club_logo_ci_hd.png`(1600×1392, RGBA)는 수정하지 않았습니다. 아래 파일은 모두 그 원본에서 다시 만든 것이며, 메타데이터(EXIF)는 없습니다.

| 파일 | 규격 | 용량 | 용도 |
|---|---|---|---|
| `poster_A.webp` / `poster_A.jpg` | 1290×1818, webp q82 / jpg q82 progressive | 379 KB / 527 KB | 테마 A(먹·금·빨강, 기본) 포스터 |
| `poster_B.webp` / `poster_B.jpg` | 1290×1818 | 360 KB / 506 KB | 테마 B(갈색 WANTED) 포스터 |
| `poster_C.webp` / `poster_C.jpg` | 1290×1818 | 451 KB / 601 KB | 테마 C(팝 만화) 포스터. 사다리 위 티켓의 AI 가짜 글자(빨간 「감푸票」)를 종이색(#FDEFD9)으로 덮고 경계를 흐림 처리함 |
| `og.jpg` | 1200×630, jpg q85 | 197 KB | `og:image`. 왼쪽 CI + 오른쪽 포스터 A 중앙(왕관 인물~「송년회 및 자체대회」 제목) |
| `favicon.png` | 256×256, 투명 | 45 KB | `<link rel="icon" href="assets/favicon.png">` |
| `apple-touch-icon.png` | 180×180, 불투명 흰 배경 | 19 KB | `<link rel="apple-touch-icon" href="assets/apple-touch-icon.png">`(iOS 는 투명을 검게 칠하므로 불투명) |
| `ci.png` | 512×445, 투명 모서리 | 150 KB | 헤더·발표 화면용 동호회 CI |

## 사용 예 (상대 경로만, 외부 CDN 없음)

```html
<picture>
  <source srcset="assets/poster_A.webp" type="image/webp">
  <img src="assets/poster_A.jpg" alt="2026 우당탕탕요절복통 송년회 및 자체대회 포스터" width="1290" height="1818" loading="lazy">
</picture>
<meta property="og:image" content="assets/og.jpg">  <!-- 배포 시 절대 URL 권장: https://playjc.co.kr/assets/og.jpg -->
```

## 공개 저장소 점검
- 포스터 3장·CI·OG 에 실명·전화번호 없음(육안 확인). 포스터 인물은 AI 생성 캐릭터이며 실사용자 사진이 아님.
- 포스터 본문에 금액(지각비 3만원 등)·장소(태릉중학교 체육관)·일시(26.11.14 07:00~10:00)가 그대로 들어 있음 — 동호회 공지 수준 정보.

## 알려진 약점
- `favicon.png` 는 CI 전체를 줄인 것이라 16~32px 탭 아이콘에서는 글자가 뭉개짐(입술 실루엣만 보임).
- 포스터 B·A 의 도장 글자(「현상수배」·「도전장」 등)도 AI 렌더라 확대 시 획이 약간 흐림. 「감푸票」 외에는 오탈자로 보이는 가짜 글자는 발견하지 못함.
- `og:image` 는 SNS 크롤러가 상대 경로를 해석하지 못하므로 배포 시 절대 URL 로 넣어야 함.
