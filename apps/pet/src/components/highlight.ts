// 튜토리얼 강조 표식.
//
// 오버레이는 `data-pt-highlight="hunger"` 같은 표식으로 강조할 요소를 찾는다.
// 좌표나 컴포넌트 참조를 튜토리얼에 적지 않는 이유는 명세 §9 가 못 박은 그대로다
// — 버튼 위치를 바꿔도 튜토리얼이 깨지지 않아야 한다.
//
// **표식을 생 문자열로 달지 않는 이유**: 값이 string 이면 'roomNext' 를
// 'roomnext' 로 적어도 빌드가 통과하고 링만 조용히 사라진다. 어휘는 tutorial.ts 의
// TutorialHighlight 하나이므로, 다는 쪽도 찾는 쪽도 그 타입을 지나게 한다
// (sprites.ts 의 furnitureSpriteName 이 스프라이트 이름에 한 것과 같다).
//
// 컴포넌트가 없는 모듈에 두는 것은 react-refresh 규칙이 컴포넌트를 함께
// export 하는 파일에만 걸리기 때문이다(game/pet/foods.ts 와 같은 이유).

import type { TutorialHighlight } from '../game/pet/tutorial'

export const HIGHLIGHT_ATTR = 'data-pt-highlight'

/** 강조 대상임을 알리는 속성. JSX 에 그대로 펼쳐 쓴다. */
export function highlightAttrs(target: TutorialHighlight): Record<string, string> {
  return { [HIGHLIGHT_ATTR]: target }
}
