package com.gujeuk.game.member.domain;

/**
 * 랭킹 조회 결과 한 줄.
 *
 * 전적(member_game_stat)과 닉네임(member)이 다른 테이블에 있어서 조회로 붙인다.
 * 순위는 여기 없다 — 정렬된 목록의 몇 번째인지일 뿐이라 서비스에서 매긴다.
 */
public record RankingRow(String nickname, int rating, int wins, int losses) {
}
