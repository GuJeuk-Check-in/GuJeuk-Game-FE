package com.gujeuk.game.match.domain;

/** 게임당 한 번씩만 쓸 수 있는 스킬. */
public enum Skill {
    /** 공격 돌이 날아가는 동안 커졌다가 멈추면서 원래 크기로 돌아온다. */
    GROW,
    /** 지정한 내 돌이 다음 상대 샷 동안 제자리에 박힌다. 맞아도 안 밀리고 상대만 튕겨나간다. */
    ANCHOR
}
