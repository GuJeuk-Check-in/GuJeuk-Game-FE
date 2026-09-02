package com.gujeuk.game.pet.domain;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;

/**
 * 회원 한 명의 펫 세이브.
 *
 * 서버는 세이브를 해석하지 않는다. 스탯 감소도 레벨업도 코인 상한도
 * 계산하지 않고, 받은 덩어리를 보관했다가 그대로 돌려준다. 규칙은 클라이언트에
 * 있고, 여기서 한 번 더 계산하면 두 벌의 규칙이 생겨 서로 어긋난다.
 *
 * {@code save}가 정본이고 name·level·exp·coins는 거기서 뽑아 채운 사본이다
 * (나중에 "레벨 10 이상 사용자 수" 같은 것을 세기 위한 조회용). 클라이언트가 그
 * 값들을 따로 보내게 하면 JSON 안의 값과 컬럼이 어긋난다.
 *
 * 값을 바꾸는 메서드가 없는 것은 일부러다. 갱신은
 * {@link PetRepository#updateIfUnchanged} 의 조건부 UPDATE 한 방으로만 한다 —
 * 엔티티를 읽어 고치고 저장하면 두 기기가 동시에 올릴 때 둘 다 검사를 통과한다.
 */
@Entity
@Table(
        name = "pet",
        uniqueConstraints = @UniqueConstraint(name = "uk_pet_member", columnNames = "member_id")
)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Pet {

    /** 컬럼 길이. 세이브의 이름이 이보다 길면 잘려 들어가는 대신 400으로 막는다. */
    public static final int NAME_MAX_LENGTH = 16;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "member_id", nullable = false)
    private Long memberId;

    @Column(nullable = false, length = NAME_MAX_LENGTH)
    private String name;

    @Column(nullable = false)
    private int level;

    @Column(nullable = false)
    private int exp;

    @Column(nullable = false)
    private int coins;

    @Column(name = "save_version", nullable = false)
    private int saveVersion;

    /**
     * 세이브 전체. JSON 컬럼에 문서 그대로 들어간다.
     *
     * {@link JsonNode}로 두는 것은 서버가 이 안을 해석하지 않기 때문이다. 자바
     * 클래스로 풀어두면 클라이언트가 세이브에 필드를 하나 더할 때마다 서버도
     * 같이 고쳐야 하고, 모르는 필드는 저장하는 순간 사라진다.
     *
     * 다른 필드와 달리 컬럼 이름(state_json)을 따르지 않는다. 이 값은 API가
     * 주고받는 save 그 자체이고(명세 §4), 그 이름이 클라이언트·응답 DTO·여기까지
     * 한 줄로 이어져야 어디서 온 무엇인지가 보인다. 컬럼 쪽이 state_json인 것은
     * DB에서 "JSON으로 담아 둔 상태"라는 뜻이라 층이 다르다.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "state_json", nullable = false)
    private JsonNode save;

    @Column(name = "synced_at", nullable = false)
    private LocalDateTime syncedAt;

    private Pet(Long memberId, PetSaveContent content, LocalDateTime syncedAt) {
        this.memberId = memberId;
        this.name = content.name();
        this.level = content.level();
        this.exp = content.exp();
        this.coins = content.coins();
        this.saveVersion = content.saveVersion();
        this.save = content.save();
        this.syncedAt = syncedAt;
    }

    public static Pet create(Long memberId, PetSaveContent content, LocalDateTime syncedAt) {
        return new Pet(memberId, content, syncedAt);
    }

    public PetSnapshot snapshot() {
        return new PetSnapshot(save, SyncTime.millis(syncedAt));
    }
}
