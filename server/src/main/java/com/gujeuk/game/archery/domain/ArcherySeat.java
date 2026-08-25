package com.gujeuk.game.archery.domain;

import lombok.Getter;
import lombok.Setter;
import org.springframework.web.socket.WebSocketSession;

import java.util.ArrayList;
import java.util.List;

/** 방에 앉은 한 명. 재접속하면 session만 갈아 끼우고 나머지는 유지한다. */
@Getter
public class ArcherySeat {
    private final Long memberId;
    private final String nickname;
    private final int rating;
    /** 이 자리가 먼저 쏘는 쪽인지. 라운드 안의 순서를 정한다. */
    private final boolean first;

    @Setter
    private WebSocketSession session;

    /** 발마다의 점수. 크기가 곧 쏜 발수다. */
    private final List<Integer> shots = new ArrayList<>();

    public ArcherySeat(Long memberId, String nickname, int rating, boolean first, WebSocketSession session) {
        this.memberId = memberId;
        this.nickname = nickname;
        this.rating = rating;
        this.first = first;
        this.session = session;
    }

    public int total() {
        return shots.stream().mapToInt(Integer::intValue).sum();
    }

    public boolean isConnected() {
        return session != null && session.isOpen();
    }
}
