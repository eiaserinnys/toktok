// Fictional QA data; schema labels reflect the private lifetime policy. No live values or identities.
export const settingsFixture={
 "revision": 27,
 "settings": {
  "deployment": {
   "mode": "demo",
   "enabled": false
  },
  "signup": {
   "policy": "invite"
  },
  "public": {
   "catalog": [
    {
     "slug": "fictional-room",
     "title": "가상 공개방",
     "enabled": true
    }
   ],
   "policy": {
    "messages": 100,
    "retentionMs": 3600000,
    "textBytes": 2048,
    "jsonBytes": 8192,
    "participants": 100,
    "watchers": 50,
    "leaseMs": 300000,
    "grantMs": 300000,
    "ipParticipants": 5,
    "ipWatchers": 5,
    "grantAdmissions": 5,
    "admissionWindowMs": 60000,
    "pendingGrants": 1000,
    "ipKeys": 2048,
    "ipMemoryMs": 300000,
    "operatorIntervalMs": 30000,
    "ipIntervalMs": 1000,
    "roomMessages": 5,
    "roomWindowMs": 1000,
    "batchMs": 2000,
    "waitMs": 25000,
    "handlers": 160,
    "waits": 150,
    "pageSize": 20,
    "responseBytes": 65536,
    "responsesPerSecond": 75,
    "responseBurst": 150,
    "bytesPerSecond": 4194304,
    "byteBurst": 8388608,
    "requestPerSecond": 300,
    "requestBurst": 320,
    "ipRequestsPerSecond": 30,
    "ipRequestBurst": 60,
    "bodyMs": 5000
   },
   "firstWindowSeconds": 300,
   "firstWindowMessages": 20,
   "agentReadCadenceSeconds": 5,
   "browserReadCadenceSeconds": 2
  },
  "private": {
   "anonymousEnabled": false,
   "createPerIpHour": 3,
   "activePerIp": 3,
   "activeGlobal": 10,
   "dailyCreates": 100,
   "anonymousDefaultTtlSeconds": 3600,
   "anonymousMaxTtlSeconds": 86400,
   "authenticatedDefaultTtlSeconds": 86400,
   "authenticatedMaxTtlSeconds": 604800,
   "persistenceAllowed": false,
   "defaultPersist": false,
   "defaultRetentionSeconds": 86400,
   "maxRetentionSeconds": 604800,
   "policy": {
    "memoryMessages": 100,
    "memoryRetentionMs": 3600000,
    "textBytes": 16384,
    "jsonBytes": 65536,
    "participants": 64,
    "senderPerMinute": 30,
    "roomPerMinute": 120,
    "persistedMessages": 10000,
    "pageSize": 20,
    "responseBytes": 65536,
    "handlers": 64,
    "bodyInflight": 8,
    "waits": 32,
    "waitMs": 25000,
    "readCadenceMs": 2000,
    "firstWindowMs": 300000,
    "firstWindowMessages": 20
   }
  },
  "identity": {
   "emailLimits": {
    "email_hour": 2,
    "email_day": 3,
    "cooldown_seconds": 120,
    "ip_hour": 30,
    "ip_day": 100,
    "month": 10000
   },
   "otpLifetimeSeconds": 600,
   "otpAttempts": 5,
   "flowTtlSeconds": 600,
   "sessionTtlSeconds": 43200,
   "invitationTtlSeconds": 604800
  },
  "budget": {
   "targetUsd": 100,
   "warningUsd": 50,
   "cutoffUsd": 70,
   "calendar": "UTC",
   "workloadCaps": [
    {
     "kind": "admission_requests",
     "unit": "count",
     "day": 100000,
     "month": 3000000
    },
    {
     "kind": "response_bytes",
     "unit": "bytes",
     "day": 3221225472,
     "month": 68719476736
    },
    {
     "kind": "private_creates",
     "unit": "count",
     "day": 100,
     "month": 2000
    },
    {
     "kind": "active_room_seconds",
     "unit": "seconds",
     "day": 144000,
     "month": 4320000
    },
    {
     "kind": "persistent_write_bytes",
     "unit": "bytes",
     "day": 16777216,
     "month": 268435456
    },
    {
     "kind": "email_attempts",
     "unit": "count",
     "day": 1000,
     "month": 10000
    }
   ]
  }
 },
 "schema": {
  "type": "object",
  "label": "설정",
  "fields": {
   "deployment": {
    "type": "object",
    "label": "서비스",
    "fields": {
     "mode": {
      "type": "enum",
      "label": "모드",
      "values": [
       "demo",
       "hosted"
      ],
      "min": null,
      "max": null,
      "unit": "enum",
      "applyTo": "new_room"
     },
     "enabled": {
      "type": "boolean",
      "label": "서비스 활성화",
      "min": null,
      "max": null,
      "unit": "boolean",
      "applyTo": "runtime"
     }
    },
    "min": null,
    "max": null,
    "unit": "object",
    "applyTo": "runtime"
   },
   "signup": {
    "type": "object",
    "label": "가입",
    "fields": {
     "policy": {
      "type": "enum",
      "label": "가입 정책",
      "values": [
       "closed",
       "invite",
       "open"
      ],
      "min": null,
      "max": null,
      "unit": "enum",
      "applyTo": "authentication"
     }
    },
    "min": null,
    "max": null,
    "unit": "object",
    "applyTo": "runtime"
   },
   "public": {
    "type": "object",
    "label": "공개방",
    "fields": {
     "catalog": {
      "type": "array",
      "label": "공개방 목록",
      "min": 0,
      "max": 10,
      "items": {
       "type": "object",
       "label": "공개방",
       "fields": {
        "slug": {
         "type": "string",
         "label": "경로",
         "min": 1,
         "max": 64,
         "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$",
         "unit": "characters",
         "applyTo": "runtime"
        },
        "title": {
         "type": "string",
         "label": "표시 제목",
         "min": 1,
         "max": 64,
         "unit": "characters",
         "applyTo": "runtime"
        },
        "enabled": {
         "type": "boolean",
         "label": "활성화",
         "min": null,
         "max": null,
         "unit": "boolean",
         "applyTo": "runtime"
        }
       },
       "min": null,
       "max": null,
       "unit": "object",
       "applyTo": "runtime"
      },
      "unit": "items",
      "applyTo": "runtime"
     },
     "policy": {
      "type": "object",
      "label": "공개방 정책",
      "fields": {
       "messages": {
        "type": "integer",
        "label": "messages",
        "min": 1,
        "max": 100,
        "unit": "count",
        "applyTo": "runtime"
       },
       "retentionMs": {
        "type": "integer",
        "label": "retentionMs",
        "min": 1,
        "max": 3600000,
        "unit": "ms",
        "applyTo": "runtime"
       },
       "textBytes": {
        "type": "integer",
        "label": "textBytes",
        "min": 1,
        "max": 2048,
        "unit": "bytes",
        "applyTo": "runtime"
       },
       "jsonBytes": {
        "type": "integer",
        "label": "jsonBytes",
        "min": 1,
        "max": 8192,
        "unit": "bytes",
        "applyTo": "runtime"
       },
       "participants": {
        "type": "integer",
        "label": "participants",
        "min": 1,
        "max": 100,
        "unit": "count",
        "applyTo": "runtime"
       },
       "watchers": {
        "type": "integer",
        "label": "watchers",
        "min": 1,
        "max": 50,
        "unit": "count",
        "applyTo": "runtime"
       },
       "leaseMs": {
        "type": "integer",
        "label": "참여 수명",
        "min": 1000,
        "max": 300000,
        "unit": "ms",
        "applyTo": "runtime"
       },
       "grantMs": {
        "type": "integer",
        "label": "입장 허가 수명",
        "min": 1000,
        "max": 300000,
        "unit": "ms",
        "applyTo": "runtime"
       },
       "ipParticipants": {
        "type": "integer",
        "label": "ipParticipants",
        "min": 1,
        "max": 5,
        "unit": "count",
        "applyTo": "runtime"
       },
       "ipWatchers": {
        "type": "integer",
        "label": "ipWatchers",
        "min": 1,
        "max": 5,
        "unit": "count",
        "applyTo": "runtime"
       },
       "grantAdmissions": {
        "type": "integer",
        "label": "grantAdmissions",
        "min": 1,
        "max": 5,
        "unit": "count",
        "applyTo": "runtime"
       },
       "admissionWindowMs": {
        "type": "integer",
        "label": "admissionWindowMs",
        "min": 60000,
        "max": 3600000,
        "unit": "ms",
        "applyTo": "runtime"
       },
       "pendingGrants": {
        "type": "integer",
        "label": "pendingGrants",
        "min": 1,
        "max": 1000,
        "unit": "count",
        "applyTo": "runtime"
       },
       "ipKeys": {
        "type": "integer",
        "label": "ipKeys",
        "min": 1,
        "max": 2048,
        "unit": "count",
        "applyTo": "runtime"
       },
       "ipMemoryMs": {
        "type": "integer",
        "label": "ipMemoryMs",
        "min": 300000,
        "max": 3600000,
        "unit": "ms",
        "applyTo": "runtime"
       },
       "operatorIntervalMs": {
        "type": "integer",
        "label": "operatorIntervalMs",
        "min": 30000,
        "max": 3600000,
        "unit": "ms",
        "applyTo": "runtime"
       },
       "ipIntervalMs": {
        "type": "integer",
        "label": "ipIntervalMs",
        "min": 1000,
        "max": 3600000,
        "unit": "ms",
        "applyTo": "runtime"
       },
       "roomMessages": {
        "type": "integer",
        "label": "roomMessages",
        "min": 1,
        "max": 5,
        "unit": "count",
        "applyTo": "runtime"
       },
       "roomWindowMs": {
        "type": "integer",
        "label": "roomWindowMs",
        "min": 1000,
        "max": 3600000,
        "unit": "ms",
        "applyTo": "runtime"
       },
       "batchMs": {
        "type": "integer",
        "label": "응답 묶음 간격",
        "min": 2000,
        "max": 10000,
        "unit": "ms",
        "applyTo": "runtime"
       },
       "waitMs": {
        "type": "integer",
        "label": "waitMs",
        "min": 1,
        "max": 25000,
        "unit": "ms",
        "applyTo": "runtime"
       },
       "handlers": {
        "type": "integer",
        "label": "handlers",
        "min": 1,
        "max": 160,
        "unit": "count",
        "applyTo": "runtime"
       },
       "waits": {
        "type": "integer",
        "label": "waits",
        "min": 1,
        "max": 150,
        "unit": "count",
        "applyTo": "runtime"
       },
       "pageSize": {
        "type": "integer",
        "label": "pageSize",
        "min": 1,
        "max": 20,
        "unit": "count",
        "applyTo": "runtime"
       },
       "responseBytes": {
        "type": "integer",
        "label": "응답 안전 불변 상한",
        "min": 65536,
        "max": 65536,
        "unit": "bytes",
        "applyTo": "runtime"
       },
       "responsesPerSecond": {
        "type": "integer",
        "label": "responsesPerSecond",
        "min": 1,
        "max": 75,
        "unit": "count",
        "applyTo": "runtime"
       },
       "responseBurst": {
        "type": "integer",
        "label": "responseBurst",
        "min": 1,
        "max": 150,
        "unit": "count",
        "applyTo": "runtime"
       },
       "bytesPerSecond": {
        "type": "integer",
        "label": "bytesPerSecond",
        "min": 1,
        "max": 4194304,
        "unit": "bytes",
        "applyTo": "runtime"
       },
       "byteBurst": {
        "type": "integer",
        "label": "byteBurst",
        "min": 1,
        "max": 8388608,
        "unit": "count",
        "applyTo": "runtime"
       },
       "requestPerSecond": {
        "type": "integer",
        "label": "requestPerSecond",
        "min": 1,
        "max": 300,
        "unit": "count",
        "applyTo": "runtime"
       },
       "requestBurst": {
        "type": "integer",
        "label": "requestBurst",
        "min": 1,
        "max": 320,
        "unit": "count",
        "applyTo": "runtime"
       },
       "ipRequestsPerSecond": {
        "type": "integer",
        "label": "ipRequestsPerSecond",
        "min": 1,
        "max": 30,
        "unit": "count",
        "applyTo": "runtime"
       },
       "ipRequestBurst": {
        "type": "integer",
        "label": "ipRequestBurst",
        "min": 1,
        "max": 60,
        "unit": "count",
        "applyTo": "runtime"
       },
       "bodyMs": {
        "type": "integer",
        "label": "bodyMs",
        "min": 1,
        "max": 5000,
        "unit": "ms",
        "applyTo": "runtime"
       }
      },
      "min": null,
      "max": null,
      "unit": "object",
      "applyTo": "runtime"
     },
     "firstWindowSeconds": {
      "type": "integer",
      "label": "이전 버전 초기 시간 범위 (현재 미사용)",
      "readOnly": true,
      "min": 1,
      "max": 300,
      "unit": "seconds",
      "applyTo": "runtime"
     },
     "firstWindowMessages": {
      "type": "integer",
      "label": "최초 읽기 메시지 수",
      "min": 1,
      "max": 20,
      "unit": "count",
      "applyTo": "runtime"
     },
     "agentReadCadenceSeconds": {
      "type": "integer",
      "label": "에이전트 권장 읽기 간격",
      "min": 1,
      "max": 300,
      "unit": "seconds",
      "applyTo": "runtime"
     },
     "browserReadCadenceSeconds": {
      "type": "integer",
      "label": "브라우저 권장 읽기 간격",
      "min": 1,
      "max": 300,
      "unit": "seconds",
      "applyTo": "runtime"
     }
    },
    "min": null,
    "max": null,
    "unit": "object",
    "applyTo": "runtime"
   },
   "private": {
    "type": "object",
    "label": "비공개방",
    "fields": {
     "anonymousEnabled": {
      "type": "boolean",
      "label": "익명 생성",
      "min": null,
      "max": null,
      "unit": "boolean",
      "applyTo": "runtime"
     },
     "createPerIpHour": {
      "type": "integer",
      "label": "IP별 시간 생성",
      "min": 1,
      "max": 3,
      "unit": "count",
      "applyTo": "runtime"
     },
     "activePerIp": {
      "type": "integer",
      "label": "데모 IP별 활성 방",
      "min": 1,
      "max": 3,
      "unit": "count",
      "applyTo": "runtime"
     },
     "activeGlobal": {
      "type": "integer",
      "label": "데모 전체 활성 방",
      "min": 1,
      "max": 10,
      "unit": "count",
      "applyTo": "runtime"
     },
     "dailyCreates": {
      "type": "integer",
      "label": "데모 일 생성",
      "min": 1,
      "max": 100,
      "unit": "count",
      "applyTo": "runtime"
     },
     "anonymousDefaultTtlSeconds": {
      "type": "integer",
      "label": "이전 익명 기본 수명 · 새 방에는 적용 안 함",
      "min": 60,
      "max": 86400,
      "unit": "seconds",
      "applyTo": "new_room",
      "readOnly": true
     },
     "anonymousMaxTtlSeconds": {
      "type": "integer",
      "label": "이전 익명 최대 수명 · 새 방에는 적용 안 함",
      "min": 60,
      "max": 86400,
      "unit": "seconds",
      "applyTo": "new_room",
      "readOnly": true
     },
     "authenticatedDefaultTtlSeconds": {
      "type": "integer",
      "label": "이전 계정 기본 수명 · 새 방에는 적용 안 함",
      "min": 60,
      "max": 604800,
      "unit": "seconds",
      "applyTo": "new_room",
      "readOnly": true
     },
     "authenticatedMaxTtlSeconds": {
      "type": "integer",
      "label": "이전 계정 최대 수명 · 새 방에는 적용 안 함",
      "min": 60,
      "max": 604800,
      "unit": "seconds",
      "applyTo": "new_room",
      "readOnly": true
     },
     "persistenceAllowed": {
      "type": "boolean",
      "label": "계정 저장 허용",
      "min": null,
      "max": null,
      "unit": "boolean",
      "applyTo": "new_room"
     },
     "defaultPersist": {
      "type": "boolean",
      "label": "기본 저장 OFF 안전 조건",
      "min": null,
      "max": null,
      "unit": "boolean",
      "applyTo": "new_room",
      "readOnly": true,
      "constant": false
     },
     "defaultRetentionSeconds": {
      "type": "integer",
      "label": "기본 보관",
      "min": 1,
      "max": 604800,
      "unit": "seconds",
      "applyTo": "new_room"
     },
     "maxRetentionSeconds": {
      "type": "integer",
      "label": "최대 보관",
      "min": 1,
      "max": 604800,
      "unit": "seconds",
      "applyTo": "new_room"
     },
     "policy": {
      "type": "object",
      "label": "방 정책",
      "fields": {
       "memoryMessages": {
        "type": "integer",
        "label": "memoryMessages",
        "min": 1,
        "max": 100,
        "unit": "count",
        "applyTo": "new_room"
       },
       "memoryRetentionMs": {
        "type": "integer",
        "label": "memoryRetentionMs",
        "min": 1,
        "max": 3600000,
        "unit": "ms",
        "applyTo": "new_room"
       },
       "textBytes": {
        "type": "integer",
        "label": "textBytes",
        "min": 1,
        "max": 16384,
        "unit": "bytes",
        "applyTo": "new_room"
       },
       "jsonBytes": {
        "type": "integer",
        "label": "jsonBytes",
        "min": 1,
        "max": 65536,
        "unit": "bytes",
        "applyTo": "new_room"
       },
       "participants": {
        "type": "integer",
        "label": "participants",
        "min": 1,
        "max": 64,
        "unit": "count",
        "applyTo": "new_room"
       },
       "senderPerMinute": {
        "type": "integer",
        "label": "senderPerMinute",
        "min": 1,
        "max": 30,
        "unit": "count",
        "applyTo": "new_room"
       },
       "roomPerMinute": {
        "type": "integer",
        "label": "roomPerMinute",
        "min": 1,
        "max": 120,
        "unit": "count",
        "applyTo": "new_room"
       },
       "persistedMessages": {
        "type": "integer",
        "label": "persistedMessages",
        "min": 1,
        "max": 10000,
        "unit": "count",
        "applyTo": "new_room"
       },
       "pageSize": {
        "type": "integer",
        "label": "pageSize",
        "min": 1,
        "max": 20,
        "unit": "count",
        "applyTo": "new_room"
       },
       "responseBytes": {
        "type": "integer",
        "label": "responseBytes",
        "min": 65536,
        "max": 65536,
        "unit": "bytes",
        "applyTo": "new_room"
       },
       "handlers": {
        "type": "integer",
        "label": "동시 처리",
        "min": 1,
        "max": 160,
        "unit": "count",
        "applyTo": "new_room"
       },
       "bodyInflight": {
        "type": "integer",
        "label": "동시 본문 처리",
        "min": 1,
        "max": 16,
        "unit": "count",
        "applyTo": "new_room"
       },
       "waits": {
        "type": "integer",
        "label": "waits",
        "min": 1,
        "max": 32,
        "unit": "count",
        "applyTo": "new_room"
       },
       "waitMs": {
        "type": "integer",
        "label": "waitMs",
        "min": 1,
        "max": 25000,
        "unit": "ms",
        "applyTo": "new_room"
       },
       "readCadenceMs": {
        "type": "integer",
        "label": "readCadenceMs",
        "min": 2000,
        "max": 10000,
        "unit": "ms",
        "applyTo": "new_room"
       },
       "firstWindowMs": {
        "type": "integer",
        "label": "firstWindowMs",
        "min": 1,
        "max": 300000,
        "unit": "ms",
        "applyTo": "new_room"
       },
       "firstWindowMessages": {
        "type": "integer",
        "label": "firstWindowMessages",
        "min": 1,
        "max": 20,
        "unit": "count",
        "applyTo": "new_room"
       }
      },
      "min": null,
      "max": null,
      "unit": "object",
      "applyTo": "new_room"
     }
    },
    "min": null,
    "max": null,
    "unit": "object",
    "applyTo": "new_room"
   },
   "identity": {
    "type": "object",
    "label": "인증",
    "fields": {
     "emailLimits": {
      "type": "object",
      "label": "메일 요청 및 발송 제한",
      "fields": {
       "email_hour": {
        "type": "integer",
        "label": "이메일 시간 요청",
        "min": 1,
        "max": 2,
        "unit": "count",
        "applyTo": "authentication"
       },
       "email_day": {
        "type": "integer",
        "label": "이메일 일 요청",
        "min": 1,
        "max": 3,
        "unit": "count",
        "applyTo": "authentication"
       },
       "cooldown_seconds": {
        "type": "integer",
        "label": "재요청 간격",
        "min": 120,
        "max": 86400,
        "unit": "seconds",
        "applyTo": "authentication"
       },
       "ip_hour": {
        "type": "integer",
        "label": "IP 시간 요청",
        "min": 1,
        "max": 30,
        "unit": "count",
        "applyTo": "authentication"
       },
       "ip_day": {
        "type": "integer",
        "label": "IP 일 요청",
        "min": 1,
        "max": 100,
        "unit": "count",
        "applyTo": "authentication"
       },
       "month": {
        "type": "integer",
        "label": "배포 월 발송",
        "min": 1,
        "max": 10000,
        "unit": "count",
        "applyTo": "authentication"
       }
      },
      "min": null,
      "max": null,
      "unit": "object",
      "applyTo": "authentication"
     },
     "otpLifetimeSeconds": {
      "type": "integer",
      "label": "OTP 수명",
      "min": 1,
      "max": 600,
      "unit": "seconds",
      "applyTo": "authentication"
     },
     "otpAttempts": {
      "type": "integer",
      "label": "OTP 오입력",
      "min": 1,
      "max": 5,
      "unit": "count",
      "applyTo": "authentication"
     },
     "flowTtlSeconds": {
      "type": "integer",
      "label": "인증 흐름 수명",
      "min": 1,
      "max": 600,
      "unit": "seconds",
      "applyTo": "authentication"
     },
     "sessionTtlSeconds": {
      "type": "integer",
      "label": "세션 수명",
      "min": 1,
      "max": 43200,
      "unit": "seconds",
      "applyTo": "authentication"
     },
     "invitationTtlSeconds": {
      "type": "integer",
      "label": "초대 수명",
      "min": 1,
      "max": 2592000,
      "unit": "seconds",
      "applyTo": "authentication"
     }
    },
    "min": null,
    "max": null,
    "unit": "object",
    "applyTo": "authentication"
   },
   "budget": {
    "type": "object",
    "label": "작업량 예산",
    "fields": {
     "targetUsd": {
      "type": "integer",
      "label": "목표",
      "min": 1,
      "max": 10000,
      "unit": "USD",
      "applyTo": "runtime"
     },
     "warningUsd": {
      "type": "integer",
      "label": "경고",
      "min": 1,
      "max": 10000,
      "unit": "USD",
      "applyTo": "runtime"
     },
     "cutoffUsd": {
      "type": "integer",
      "label": "차단",
      "min": 1,
      "max": 10000,
      "unit": "USD",
      "applyTo": "runtime"
     },
     "calendar": {
      "type": "enum",
      "label": "달력",
      "values": [
       "UTC"
      ],
      "min": null,
      "max": null,
      "unit": "enum",
      "applyTo": "runtime"
     },
     "workloadCaps": {
      "type": "array",
      "label": "작업량 상한",
      "min": 6,
      "max": 6,
      "items": {
       "type": "object",
       "label": "상한",
       "fields": {
        "kind": {
         "type": "enum",
         "label": "종류",
         "values": [
          "admission_requests",
          "response_bytes",
          "private_creates",
          "active_room_seconds",
          "persistent_write_bytes",
          "email_attempts"
         ],
         "min": null,
         "max": null,
         "unit": "enum",
         "applyTo": "runtime"
        },
        "unit": {
         "type": "enum",
         "label": "단위",
         "values": [
          "count",
          "bytes",
          "seconds"
         ],
         "min": null,
         "max": null,
         "unit": "enum",
         "applyTo": "runtime"
        },
        "day": {
         "type": "integer",
         "label": "일 상한",
         "min": 1,
         "max": 3221225472,
         "unit": "units",
         "applyTo": "runtime"
        },
        "month": {
         "type": "integer",
         "label": "월 상한",
         "min": 1,
         "max": 68719476736,
         "unit": "units",
         "applyTo": "runtime"
        }
       },
       "min": null,
       "max": null,
       "unit": "object",
       "applyTo": "runtime"
      },
      "unit": "items",
      "applyTo": "runtime",
      "boundsByKind": {
       "admission_requests": {
        "unit": "count",
        "dayMax": 100000,
        "monthMax": 3000000
       },
       "response_bytes": {
        "unit": "bytes",
        "dayMax": 3221225472,
        "monthMax": 68719476736
       },
       "private_creates": {
        "unit": "count",
        "dayMax": 100,
        "monthMax": 2000
       },
       "active_room_seconds": {
        "unit": "seconds",
        "dayMax": 144000,
        "monthMax": 4320000
       },
       "persistent_write_bytes": {
        "unit": "bytes",
        "dayMax": 16777216,
        "monthMax": 268435456
       },
       "email_attempts": {
        "unit": "count",
        "dayMax": 1000,
        "monthMax": 10000
       }
      }
     }
    },
    "min": null,
    "max": null,
    "unit": "object",
    "applyTo": "runtime"
   }
  },
  "min": null,
  "max": null,
  "unit": "object",
  "applyTo": "runtime"
 },
 "effects": {}
};

// Current server metadata; fixture values remain deliberately below the ceilings.
for (const [scope, countKey, timeKey] of [['public','messages','retentionMs'],['private','memoryMessages','memoryRetentionMs']]) {
 const policy=settingsFixture.schema.fields[scope].fields.policy;
 policy.recentBufferBounds={maxMessages:500,maxBytes:2097152,maxAgeMs:3600000};
 policy.fields[countKey].max=500;policy.fields[countKey].label='최근 DB 버퍼 메시지 상한';
 policy.fields[timeKey].label='최근 DB 버퍼 시간 상한';
}

settingsFixture.schema.fields.private.fields.defaultPersist.label='장기 보관 기본 OFF 안전 조건';
settingsFixture.schema.fields.private.fields.persistenceAllowed.label='계정 장기 보관 선택 허용';
settingsFixture.schema.fields.private.fields.defaultRetentionSeconds.label='기본 장기 보관';
settingsFixture.schema.fields.private.fields.maxRetentionSeconds.label='최대 장기 보관';
