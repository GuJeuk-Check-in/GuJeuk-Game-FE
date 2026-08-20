package com.gujeuk.game.match.domain;

/** 배치 좌표. 물리 세계 좌표계(0~600) 기준이며 클라와 값이 정확히 같아야 한다. */
public record Stone(double x, double y) {
}
