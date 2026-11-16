// 행사 화면 아이콘: 가게 그림처럼 따뜻한 색을 칠하고 진한 갈색 테두리를 둘렀어요 (그림 붙임딱지 느낌)
// 주황 버튼 위에서도, 흰 버튼 위에서도 잘 보이게 테두리를 진하게 했어요
const INK = '#5A3418';
const W = `stroke="${INK}" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"`;

const SVG: Record<string, string> = {
  // 우승컵 (금빛, 양손잡이, 받침)
  trophy: `<path d="M7 4h10v3.2c0 3.6-2.2 6.3-5 6.3s-5-2.7-5-6.3z" fill="#F7C744" ${W}/>
    <path d="M7 5.5H4.6c0 2.6 1.1 4.3 3.1 4.6M17 5.5h2.4c0 2.6-1.1 4.3-3.1 4.6" fill="none" ${W}/>
    <path d="M10.4 13.2h3.2l.5 3.3h-4.2z" fill="#E9A92A" ${W}/>
    <rect x="7.6" y="16.5" width="8.8" height="3.6" rx="1.2" fill="#C98A3E" ${W}/>
    <path d="M9.4 6.3c-.1 1.6.3 3 1.2 4" fill="none" stroke="#FFF4C8" stroke-width="1.4" stroke-linecap="round"/>`,
  // 별
  star: `<path d="M12 3.2l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.2l-5.1 2.7 1-5.7-4.1-4 5.7-.8z" fill="#F7C744" ${W}/>
    <path d="M9.6 9.6l1.3-.2" stroke="#FFF4C8" stroke-width="1.4" stroke-linecap="round"/>`,
  // 막대 그래프 (평균)
  chart: `<rect x="4" y="12" width="4" height="8" rx="1" fill="#8DC26F" ${W}/>
    <rect x="10" y="7" width="4" height="13" rx="1" fill="#F0974A" ${W}/>
    <rect x="16" y="10" width="4" height="10" rx="1" fill="#6FB3E0" ${W}/>
    <path d="M3 20.5h18" fill="none" ${W}/>`,
  // 새로 고침 (동그랗게 도는 화살표)
  refresh: `<path d="M18.5 9.5A7 7 0 1 0 19 13.5" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M19.4 4.6v5.3h-5.3z" fill="#F0974A" ${W}/>`,
  // 인터넷 끊김
  offline: `<path d="M4 10a12 12 0 0 1 16 0M7 13.2a7.5 7.5 0 0 1 10 0" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>
    <circle cx="12" cy="17" r="1.8" fill="#F0974A" ${W}/>
    <path d="M4.5 4.5l15 15" stroke="#E3645A" stroke-width="2.4" stroke-linecap="round"/>`,
  // 조심 (세모 안 느낌표)
  warn: `<path d="M12 3.6l9 15.6H3z" fill="#F7C744" ${W}/>
    <path d="M12 9.2v4.8" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>
    <circle cx="12" cy="16.6" r="1.25" fill="${INK}"/>`,
  // 라면 그릇 (도전하러 가기)
  bowl: `<path d="M5 8.5c1.5-2 2.2-3 4-4M9.5 8.5c1.4-2 2-3 3.6-4" fill="none" stroke="${INK}" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M3.4 11h17.2c0 4.6-3.6 8.2-8.6 8.2S3.4 15.6 3.4 11z" fill="#FFF4E6" ${W}/>
    <path d="M6.6 14.2h10.8" stroke="#E3645A" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M5 11c1-1.3 2-1.3 3 0s2 1.3 3 0 2-1.3 3 0 2 1.3 3 0 1.6-1.1 2.2-.3" fill="none" stroke="#E9A92A" stroke-width="1.6" stroke-linecap="round"/>`,
};

// 1·2·3등 메달 (리본 + 둥근 메달 + 숫자)
const MEDAL = ['#F7C744', '#D5DCE4', '#E2A06A'];
const medalSvg = (n: number) => `<path d="M8 2.5h3l2 6h-3zM16 2.5h-3l-2 6h3z" fill="${n === 1 ? '#E3645A' : n === 2 ? '#6FB3E0' : '#8DC26F'}" ${W}/>
  <circle cx="12" cy="14.5" r="6.3" fill="${MEDAL[n - 1]}" ${W}/>
  <text x="12" y="17.6" text-anchor="middle" font-family="Jua, sans-serif" font-size="8.6" fill="${INK}">${n}</text>`;

export function icon(name: string, size = 24): string {
  const body = name.startsWith('medal') ? medalSvg(Number(name.slice(5)) || 1) : SVG[name] ?? '';
  return `<svg class="gi" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${body}</svg>`;
}
