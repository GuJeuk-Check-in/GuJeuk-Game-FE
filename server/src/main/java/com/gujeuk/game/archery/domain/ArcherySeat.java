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

    /** 방이 이 자리를 떠난 것으로 표시했는지. */
    @Setter
    private boolean away = false;

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

    /**
     * 지금 이 자리에 사람이 붙어 있는지.
     *
     * session.isOpen()만 보면 세션이 없는 경우와 아직 닫히기 전이지만 이미
     * 떠난 경우를 가르지 못한다. 방이 disconnect를 받은 시점에 away를 올리고
     * 재접속에서 내린다.
     */
    public boolean isConnected() {
        return !away && (session == null || session.isOpen());
    }
}
