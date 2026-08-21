package com.gujeuk.game.member.domain;

/**
 * 전적과 레이팅을 나누는 기준.
 *
 * 게임마다 실력의 의미가 다르다. 알까기를 잘한다고 틱택토를 잘하는 게 아니고,
 * 한 통에 섞으면 어느 쪽 실력인지 알 수 없는 숫자가 된다. 그래서 회원 하나가
 * 게임별로 따로 레이팅을 갖는다.
 *
 * 게임을 추가하면 여기에 한 줄을 더한다. 저장은 이름 문자열로 하므로
 * (VARCHAR + EnumType.STRING) 순서를 바꿔도 기존 데이터가 어긋나지 않는다.
 */
public enum GameType {
    ALKKAGI,
    TIC_TAC_TOE
}
