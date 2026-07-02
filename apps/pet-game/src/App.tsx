import { useEffect } from 'react'
import './game/PetGame.css'
import { initGame } from './game/PetGame'

export default function App() {
  useEffect(() => {
    return initGame()
  }, [])

  return (
    <div id="phone">
      <div className="screen on" id="s-login">
        <div className="logo">📍 구즉 펫 타운</div>
        <div className="tagline">매일 들러서 포인트를 모으고<br />나만의 친구를 키우고 꾸며요</div>
        <div className="mascotrow" id="loginMascots"></div>
        <div className="field"><label>이름</label><input id="nick" type="text" maxLength={10} placeholder="이름을 입력하세요" autoComplete="off" /></div>
        <div className="field"><label>휴대폰 번호</label><input id="loginPhone" type="tel" maxLength={13} placeholder="010-0000-0000" autoComplete="off" inputMode="numeric" /></div>
        <button className="btn btn-primary" id="loginBtn" disabled>로그인</button>
        <div className="loginnote">* 프로토타입입니다. 이름과 번호만 입력하면 바로 시작돼요.</div>
      </div>

      <div className="screen" id="s-select">
        <div className="h1">함께할 친구 고르기</div>
        <div className="h2">한 번 고르면 이 친구를 쭉 키우게 돼요</div>
        <div className="picks" id="picks"></div>
        <div id="nameWrap">
          <div className="lbl">이름 지어주기</div>
          <div className="field" style={{ maxWidth: 'none', marginTop: 0 }}>
            <input id="petname" type="text" maxLength={8} placeholder="예) 몽실이" autoComplete="off" />
          </div>
          <button className="btn btn-primary" id="selStart" style={{ maxWidth: 'none' }} disabled>이 친구와 시작하기</button>
        </div>
      </div>

      <div className="screen" id="s-game">
        <header>
          <div><div className="hname" id="hname">—</div><div className="hstage" id="hstage">—</div></div>
          <div className="hright">
            <div className="pts">⭐ <span id="hpts">0</span></div>
            <button className="iconbtn" id="menuBtn">⚙️</button>
          </div>
        </header>
        <div id="room">
          <div id="wall"></div><div id="floor"></div>
          <div id="winf"><div id="wini">
            <svg viewBox="0 0 130 96" preserveAspectRatio="xMidYMid slice">
              <rect id="sky" width="130" height="96" fill="#BFE3F5" />
              <g id="stars" opacity="0">
                <circle cx="20" cy="18" r="1.3" fill="#fff" /><circle cx="50" cy="13" r="1" fill="#fff" />
                <circle cx="86" cy="20" r="1.3" fill="#fff" /><circle cx="110" cy="15" r="1" fill="#fff" />
                <circle cx="64" cy="36" r="1" fill="#fff" />
              </g>
              <circle id="celest" cx="100" cy="26" r="13" fill="#FFD66B" />
              <path d="M0 74 Q34 56 66 72 Q100 90 130 70 L130 96 L0 96 Z" fill="#9BC98C" />
              <path d="M0 84 Q40 74 80 84 Q108 92 130 82 L130 96 L0 96 Z" fill="#7FB873" />
            </svg>
          </div><div className="winbar" id="wbv"></div><div className="winbar" id="wbh"></div></div>
          <div id="rug"></div>
          <div id="propLayer"></div>
          <div id="night"></div>
          <div id="petc"><div id="bubble"></div><div id="petface"></div></div>
        </div>
        <div id="stats">
          <div className="stat"><span className="ic">🍖</span><span className="lab" id="lbFeed">배고픔</span><span className="tk"><span className="fl" id="fHunger"></span></span><span className="pc" id="pHunger">0</span></div>
          <div className="stat"><span className="ic">😊</span><span className="lab">행복</span><span className="tk"><span className="fl" id="fHappy"></span></span><span className="pc" id="pHappy">0</span></div>
          <div className="stat"><span className="ic">🫧</span><span className="lab">청결</span><span className="tk"><span className="fl" id="fClean"></span></span><span className="pc" id="pClean">0</span></div>
          <div className="stat"><span className="ic">⚡</span><span className="lab">에너지</span><span className="tk"><span className="fl" id="fEnergy"></span></span><span className="pc" id="pEnergy">0</span></div>
          <div className="xpw">
            <div className="xprow"><span className="l">성장 경험치</span><span className="v" id="xpText">0 / 30</span></div>
            <div className="xptk"><span className="xpfl" id="xpFill"></span></div>
          </div>
        </div>
        <div id="actions">
          <div className="agrid">
            <button className="act" data-a="feed"><div className="ai" id="iFeed">🍖</div><div className="at" id="tFeed">밥주기</div><div className="ac">-1</div></button>
            <button className="act" data-a="play"><div className="ai" id="iPlay">🎾</div><div className="at" id="tPlay">놀기</div><div className="ac">-2</div></button>
            <button className="act" data-a="clean"><div className="ai">🫧</div><div className="at" id="tClean">씻기기</div><div className="ac">-2</div></button>
            <button className="act" data-a="sleep"><div className="ai" id="iSleep">😴</div><div className="at" id="tSleep">재우기</div><div className="ac">-1</div></button>
            <button className="act" id="shopBtn"><div className="ai">🛍️</div><div className="at">상점</div><div className="ac">꾸미기</div></button>
          </div>
          <div id="dailyInfo">—</div>
        </div>
      </div>

      <div className="modal" id="shopModal"><div className="sheet">
        <div className="sh"><div className="t">상점 🛍️</div><button className="iconbtn x" id="shopClose">✕</button></div>
        <div className="tabs">
          <div className="tab on" data-tab="hat">🧢 꾸미기</div>
          <div className="tab" data-tab="prop">⚽ 소품</div>
          <div className="tab" data-tab="buff">✨ 효과</div>
        </div>
        <div id="shopList"></div>
      </div></div>

      <div className="modal" id="menuModal"><div className="sheet">
        <div className="sh"><div className="t">메뉴 ⚙️</div><button className="iconbtn x" id="menuClose">✕</button></div>
        <div className="ssub" id="menuStats">—</div>
        <div className="menurow">
          <button className="menubtn" id="logoutBtn">🔓 로그아웃</button>
          <button className="menubtn danger" id="resetBtn">🗑️ 처음부터 다시 시작</button>
        </div>
      </div></div>

      <div id="toast"></div>
    </div>
  )
}
