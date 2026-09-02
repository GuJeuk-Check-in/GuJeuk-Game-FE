// 날짜 경계를 정하는 함수 하나만 두는 모듈.
//
// 파일을 따로 만든 이유: `daily.date` 를 만드는 곳(save.ts)과 날짜가 넘어갔는지
// 판단하는 곳(stats.ts)이 각자 자기 버전을 갖고 있었다. 지금은 동작이 같지만,
// 한쪽만 고치는 순간 매 접속마다 날짜 넘김으로 오인해 출석 코인이 무한 지급된다.
// 둘 중 한쪽에 두면 나머지가 그쪽을 import 해야 해서 의존 방향이 어색해지므로,
// 양쪽이 함께 바라보는 자리를 만들었다.
//
// **stats.ts · save.ts 에서 다시 export 하지 않는다.** 그러면 정식 import 경로가
// 셋이 되어, 한 곳으로 모으려고 이 파일을 만든 이유가 그대로 사라진다.

/**
 * 로컬 시각 기준 YYYY-MM-DD.
 *
 * `toISOString()` 을 쓰면 안 된다 — UTC 기준이라 한국에서는 **오전 9시에 날짜가
 * 바뀐다.** "자정에 초기화된다"는 약속이 그대로 깨진다.
 */
export function localDateKey(at: number): string {
  const date = new Date(at)
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}
