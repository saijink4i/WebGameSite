// 서버 로깅 및 디버깅 개선
const DEBUG = true;  // 디버그 모드 활성화

// 향상된 로깅 함수
function logDebug(message, data = null) {
  if (DEBUG) {
    if (data) {
      console.log(`[ZombieDice Debug] ${message}`, data);
    } else {
      console.log(`[ZombieDice Debug] ${message}`);
    }
  }
}

// 가장 상단에 추가
console.log("좀비 다이스 서버 시작됨");

// 좀비 다이스 관련 코드
console.log("서버 시작: 좀비 다이스 게임 모듈 초기화");

// 좀비 다이스 게임을 위한 방 정보 저장
const zombieDiceGames = new Map();

// 게임 상태 정의
const GameStatus = {
  WAITING: 'waiting',
  PLAYING: 'playing',
  FINISHED: 'finished'
};

// 소켓 연결 부분을 확실하게 수정
io.on('connection', (socket) => {
  // 일반 console.log로 변경하여 확실히 출력되도록 함
  console.log(`새 클라이언트 연결됨: ${socket.id}`);
  
  // 모든 이벤트 리스너 확인용 로그
  console.log("이벤트 리스너 등록 중...");
  
  // 소켓 테스트용 이벤트 추가
  socket.emit('serverStatus', { status: 'connected' });
  
  // 게임 시작 이벤트 처리
  socket.on('gameStarted', (data) => {
    const { roomId, gameType, firstPlayer } = data;
    console.log(`게임 시작: ${gameType}, 방 ID: ${roomId}, 첫 플레이어: ${firstPlayer}`);
    
    // 해당 방의 모든 플레이어에게 게임 시작 알림
    socket.to(roomId).emit('gameStarted', {
      gameType,
      firstPlayer
    });
  });
  
  // 주사위 굴리기 요청 처리
  socket.on('rollDice', (data) => {
    try {
      const { roomId, dicePool } = data;
      console.log(`[좀비다이스] 방 ${roomId}에서 주사위 굴리기 요청:`, {
        socketId: socket.id,
        dicePool
      });

      // 게임 상태 확인
      const gameState = zombieDiceGames.get(roomId);
      if (!gameState) {
        console.log(`[좀비다이스] 오류: 방 ${roomId}의 게임 상태가 없음`);
        return;
      }

      // 현재 플레이어 확인
      const currentPlayer = gameState.players[gameState.currentTurn];
      if (currentPlayer.id !== socket.id) {
        console.log(`[좀비다이스] 오류: 현재 차례가 아닌 플레이어가 주사위 굴림 시도`);
        socket.emit('gameError', { message: '당신의 차례가 아닙니다.' });
        return;
      }

      // 주사위 풀에서 3개 선택
      const selectedDice = selectDice(dicePool, 3);
      console.log(`[좀비다이스] 선택된 주사위:`, selectedDice);

      // 주사위 결과 생성
      const results = rollSelectedDice(selectedDice);
      console.log(`[좀비다이스] 주사위 결과:`, results);

      // 결과 집계
      const brains = results.filter(r => r.result === 'BRAIN').length;
      const shotguns = results.filter(r => r.result === 'SHOTGUN').length;
      const footsteps = results.filter(r => r.result === 'FOOTSTEPS').length;

      // 턴 통계 업데이트
      gameState.turnStats.brains += brains;
      gameState.turnStats.shotguns += shotguns;

      // 주사위 풀 업데이트
      const updatedPool = [...dicePool];
      
      // 선택된 주사위 제거
      for (const dice of selectedDice) {
        const index = updatedPool.indexOf(dice);
        if (index !== -1) {
          updatedPool.splice(index, 1);
        }
      }
      
      // 발자국 결과는 풀에 다시 추가
      results.forEach((result, index) => {
        if (result.result === 'FOOTSTEPS') {
          updatedPool.push(selectedDice[index]);
        }
      });

      // 응답 데이터 구성
      const response = {
        results,
        brains,
        shotguns,
        footsteps,
        dicePool: updatedPool,
        totalBrains: gameState.turnStats.brains,
        totalShotguns: gameState.turnStats.shotguns
      };

      console.log(`[좀비다이스] 응답 데이터:`, response);

      // 모든 플레이어에게 결과 전송
      io.to(roomId).emit('diceRolled', {
        player: socket.id,
        ...response
      });

      console.log(`[좀비다이스] 주사위 결과 전송 완료`);
    } catch (error) {
      console.error(`[좀비다이스] 오류:`, error);
      socket.emit('gameError', { message: '주사위 굴리기 중 오류가 발생했습니다.' });
    }
  });
  
  // 턴 종료 요청 처리
  socket.on('endTurn', (data) => {
    const { roomId, keepScore } = data;
    console.log(`[좀비다이스] 방 ${roomId}에서 턴 종료 요청:`, { keepScore });

    // 게임 상태 확인
    const gameState = zombieDiceGames.get(roomId);
    if (!gameState) {
      console.log(`[좀비다이스] 오류: 방 ${roomId}의 게임 상태가 없음`);
      return;
    }

    // 점수 계산
    if (keepScore && gameState.turnStats.shotguns < 3) {
      gameState.scores[socket.id] += gameState.turnStats.brains;
      console.log(`[좀비다이스] 플레이어 ${socket.id}가 ${gameState.turnStats.brains}점 획득`);
    } else {
      console.log(`[좀비다이스] 플레이어 ${socket.id}가 0점 획득 (총 3개 이상 또는 턴 포기)`);
    }

    // 다음 플레이어로 턴 변경
    gameState.currentTurn = (gameState.currentTurn + 1) % gameState.players.length;
    const nextPlayer = gameState.players[gameState.currentTurn];

    // 턴 통계 초기화
    gameState.turnStats = { brains: 0, shotguns: 0 };

    // 다음 턴 알림
    io.to(roomId).emit('turnChanged', {
      nextPlayer: nextPlayer.id,
      scores: gameState.scores
    });

    console.log(`[좀비다이스] 턴 변경: 다음 플레이어 ${nextPlayer.id}`);
  });
  
  // 소켓 상태 테스트용 이벤트
  socket.on('ping', () => {
    console.log("Ping 요청 수신");
    socket.emit('pong', { time: new Date().toISOString() });
  });
  
  // 연결 종료 시
  socket.on('disconnect', () => {
    console.log(`클라이언트 연결 해제: ${socket.id}`);
  });
});

// 주사위 풀에서 n개 선택
function selectDice(dicePool, count) {
  const pool = [...dicePool];
  const selected = [];
  
  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const randomIndex = Math.floor(Math.random() * pool.length);
    selected.push(pool[randomIndex]);
    pool.splice(randomIndex, 1);
  }
  
  return selected;
}

// 선택된 주사위 굴리기
function rollSelectedDice(diceTypes) {
  return diceTypes.map(type => {
    const faceIndex = Math.floor(Math.random() * 6);
    let result;
    
    // 주사위 타입별 결과 확률
    if (type === 'RED') {
      result = faceIndex < 1 ? 'BRAIN' : (faceIndex < 4 ? 'SHOTGUN' : 'FOOTSTEPS');
    } else if (type === 'YELLOW') {
      result = faceIndex < 2 ? 'BRAIN' : (faceIndex < 4 ? 'SHOTGUN' : 'FOOTSTEPS');
    } else { // GREEN
      result = faceIndex < 3 ? 'BRAIN' : (faceIndex < 4 ? 'SHOTGUN' : 'FOOTSTEPS');
    }
    
    return { type, result, faceIndex };
  });
}

// 주사위 타입에 따른 면 정의 함수
function getDiceFaces(diceType) {
  // 서버 측에서 주사위 면 정의
  const DICE_FACES = {
    RED: [
      { type: 'BRAIN' },     // 1면
      { type: 'BRAIN' },     // 2면
      { type: 'SHOTGUN' },   // 3면
      { type: 'SHOTGUN' },   // 4면
      { type: 'SHOTGUN' },   // 5면
      { type: 'FOOTSTEPS' }  // 6면
    ],
    YELLOW: [
      { type: 'BRAIN' },     // 1면
      { type: 'BRAIN' },     // 2면
      { type: 'SHOTGUN' },   // 3면
      { type: 'SHOTGUN' },   // 4면
      { type: 'FOOTSTEPS' }, // 5면
      { type: 'FOOTSTEPS' }  // 6면
    ],
    GREEN: [
      { type: 'BRAIN' },     // 1면
      { type: 'BRAIN' },     // 2면
      { type: 'BRAIN' },     // 3면
      { type: 'SHOTGUN' },   // 4면
      { type: 'FOOTSTEPS' }, // 5면
      { type: 'FOOTSTEPS' }  // 6면
    ]
  };
  
  return DICE_FACES[diceType] || [];
}

// 초기 주사위 풀 생성 함수
function getInitialDicePool() {
  return [
    'RED', 'RED', 'RED',
    'YELLOW', 'YELLOW', 'YELLOW', 'YELLOW',
    'GREEN', 'GREEN', 'GREEN', 'GREEN', 'GREEN', 'GREEN'
  ];
} 