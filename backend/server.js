const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Express 서버 설정
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS 설정
const cors = require('cors');
app.use(cors({
  origin: 'http://localhost:3000',
  methods: ['GET', 'POST'],
  credentials: true
}));

// 게임 상태 상수
const GAME_STATUS = {
  WAITING: 'WAITING',
  IN_PROGRESS: 'IN_PROGRESS'
};

// 플레이어 상태 상수
const PLAYER_STATUS = {
  WAITING: 'WAITING',
  READY: 'READY',
  PLAYING: 'PLAYING',
  SPECTATING: 'SPECTATING'
};

// 방 목록 관리
let rooms = new Map();
// 사용자 세션 관리: userId와 socketId의 매핑을 저장
const userSessions = new Map();
// 사용자가 참여 중인 방 정보: userId -> roomId 매핑
const userRooms = new Map();

// 방 생성 API
app.post('/api/rooms', (req, res) => {
  const roomId = Date.now().toString();
  const { creator, title, maxPlayers, password, gameType } = req.body;
  
  rooms.set(roomId, {
    id: roomId,
    title: title || `${creator}의 방`,
    players: [{
      nickname: creator,
      status: PLAYER_STATUS.WAITING
    }],
    maxPlayers: maxPlayers || 4,
    hasPassword: Boolean(password),
    password: password || null,
    gameType: gameType,
    status: GAME_STATUS.WAITING,
    messages: [], // 채팅 메시지를 저장할 배열 추가
    bannedUsers: [], // 추방된 유저 목록 추가
    recentlyLeft: new Set(), // 최근에 퇴장한 유저 목록 추가 (중복 메시지 방지용)
    recentlyJoined: new Set(), // 최근에 입장한 유저 목록 추가 (중복 메시지 방지용)
    recentMessages: new Map() // 최근 메시지 내용과 타임스탬프 (중복 메시지 방지용)
  });
  
  console.log(`[방 생성] ID: ${roomId}, 방장: ${creator}`);
  res.json({ roomId });
});

// 방 목록 조회 API
app.get('/api/rooms', (req, res) => {
  const roomsList = Array.from(rooms.values()).map(room => {
    const { id, title, maxPlayers, hasPassword, gameType, status } = room;
    return {
      id,
      title,
      players: room.players.map(p => p.nickname),
      maxPlayers,
      hasPassword,
      gameType,
      status
    };
  });
  res.json(roomsList);
});

// 방 비밀번호 유효성 검증 API
app.post('/api/rooms/validate-password', (req, res) => {
  const { roomId, password, userId } = req.body;
  
  // 방 정보 조회
  const room = rooms.get(roomId);
  if (!room) {
    return res.json({ valid: false, message: '방을 찾을 수 없습니다.' });
  }
  
  // 비밀번호 확인
  const isValid = room.password === password;
  
  console.log(`[비밀번호 검증] 방 ID: ${roomId}, 유효성: ${isValid}, 사용자 ID: ${userId || '없음'}`);
  
  res.json({ valid: isValid });
});

// 소켓 연결 설정
io.on('connection', (socket) => {
  const userId = socket.handshake.query.userId;
  console.log(`[소켓 연결] ID: ${socket.id}, 사용자 ID: ${userId}`);
  
  // 사용자 ID가 있는 경우 세션 관리에 추가
  if (userId) {
    // 이전 소켓 ID가 있는지 확인
    const prevSocketId = userSessions.get(userId);
    
    if (prevSocketId && prevSocketId !== socket.id) {
      console.log(`[세션 업데이트] 사용자 ID ${userId}에 대한 소켓 ID 업데이트: ${prevSocketId} -> ${socket.id}`);
      
      // 이전 방 정보 찾기
      const prevRoomId = userRooms.get(userId);
      if (prevRoomId) {
        console.log(`[자동 재연결] 사용자 ID ${userId}는 이전에 방 ${prevRoomId}에 있었습니다.`);
        
        // 이 시점에서는 room join을 자동으로 하지 않고, 클라이언트의 rejoinRoom 요청을 기다림
      }
    } else {
      console.log(`[새 세션] 사용자 ID ${userId}를 세션에 추가합니다.`);
    }
    
    // 세션 정보 업데이트
    userSessions.set(userId, socket.id);
    
    // 소켓 객체에 사용자 ID 저장
    socket.userId = userId;
  }
  
  // 방 참가
  socket.on('joinRoom', ({ roomId, nickname, userId }) => {
    // 중복 참가 요청 감지 및 로깅
    const isAlreadyInRoom = socket.roomId === roomId && socket.nickname === nickname;
    console.log(`[joinRoom 이벤트 수신] 방 ID: ${roomId}, 닉네임: ${nickname}, 사용자 ID: ${userId}, 소켓 ID: ${socket.id}, 이미 방에 참가: ${isAlreadyInRoom}`);
    
    // 이미 동일한 방에 참가해 있는 경우 중복 처리하지 않음
    if (isAlreadyInRoom) {
      console.log(`[중복 참가 요청] 소켓 ID: ${socket.id}는 이미 방 ${roomId}에 ${nickname}으로 참가 중입니다. 무시합니다.`);
      
      // 중복 요청이더라도 roomInfo는 다시 보내줌 (클라이언트 상태 동기화를 위해)
      const room = rooms.get(roomId);
      if (room) {
        socket.emit('roomInfo', {
          id: room.id,
          title: room.title,
          players: room.players,
          maxPlayers: room.maxPlayers,
          hasPassword: room.hasPassword,
          gameType: room.gameType,
          status: room.status
        });
      }
      
      return;
    }
    
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('error', { message: '방을 찾을 수 없습니다.' });
      return;
    }
    
    // 추방된 유저인지 확인
    if (room.bannedUsers.includes(nickname)) {
      socket.emit('error', { message: '방장에게 추방된 방입니다.' });
      return;
    }

    // 기존에 참가중인 다른 방이 있는지 확인하고 정리
    if (socket.roomId && socket.roomId !== roomId) {
      const prevRoom = rooms.get(socket.roomId);
      if (prevRoom) {
        console.log(`[방 변경] 소켓 ID: ${socket.id}가 방 ${socket.roomId}에서 ${roomId}로 이동합니다. 기존 방에서 나가기 처리합니다.`);
        // 이전 방에서 플레이어 제거 처리 (이전 방의 다른 플레이어들에게 퇴장 알림)
        handlePlayerLeaveRoom(socket, prevRoom);
      }
    }
    
    // 사용자 ID 저장 (소켓 객체에 다시 한번 명시적으로 저장)
    socket.userId = userId;
    
    // 방 참가
    socket.join(roomId);
    socket.roomId = roomId;
    socket.nickname = nickname;
    
    // 참여 중인 방 정보 업데이트
    if (userId) {
      userRooms.set(userId, roomId);
    }

    // 이미 참가한 플레이어인지 확인 (nickname 대신 userId로 확인)
    let existingPlayer = null;
    if (userId) {
      existingPlayer = room.players.find(p => p.userId === userId);
    }
    
    // existingPlayer가 없으면 닉네임으로 한번 더 체크 (기존 코드와의 호환성)
    if (!existingPlayer) {
      existingPlayer = room.players.find(p => p.nickname === nickname);
    }
    
    // 방금 입장한 사용자 본인의 메시지 ID 저장 (중복 방지용)
    let newJoinMessageId = null;
    
    // 새로운 플레이어만 추가
    if (!existingPlayer) {
      console.log(`[신규 플레이어 입장] ${nickname}님은 신규 플레이어로 입장 (사용자 ID: ${userId})`);
      
      // 최근 입장 목록에 있는지 확인 (중복 메시지 방지)
      if (room.recentlyJoined.has(userId || nickname)) {
        console.log(`[입장 중복 방지] ${nickname}님은 이미 입장 처리되었습니다. 메시지 표시하지 않음.`);
      } else {
        // 플레이어 목록에 추가 (userId도 함께 저장)
        room.players.push({
          nickname: nickname,
          status: PLAYER_STATUS.WAITING,
          userId: userId,
          socketId: socket.id
        });
        
        // 최근 입장 목록에 추가 (중복 메시지 방지용)
        room.recentlyJoined.add(userId || nickname);
        console.log(`[입장 중복 방지 목록 추가] ${nickname}님을 recentlyJoined 목록에 추가함`);
        
        // 일정 시간 후 목록에서 제거 (메모리 관리)
        setTimeout(() => {
          if (room.recentlyJoined) {
            room.recentlyJoined.delete(userId || nickname);
            console.log(`[입장 처리 완료] ${nickname}님의 입장 중복 방지 목록에서 제거됨`);
          }
        }, 5000);
        
        // 입장 메시지 추가
        const messageText = `${nickname}님이 입장하셨습니다.`;
        
        // 최근 메시지 확인
        const now = Date.now();
        const messageKey = `system:${messageText}`;
        const lastSent = room.recentMessages.get(messageKey);
        
        // 2초 이내에 같은 메시지가 전송되지 않도록 함
        if (!lastSent || (now - lastSent > 2000)) {
          // 메시지 전송 시간 기록
          room.recentMessages.set(messageKey, now);
          
          const joinMessage = {
            type: 'system',
            message: messageText,
            timestamp: new Date().toISOString()
          };
          
          console.log(`[입장 메시지 생성] ${nickname}님의 입장 메시지 생성 시간: ${joinMessage.timestamp}`);
          room.messages.push(joinMessage);
          
          // 입장 메시지 ID를 생성하여 저장 (중복 방지용)
          newJoinMessageId = `system-${messageText}-${joinMessage.timestamp}`;
          
          // 입장 메시지 전송 - 방에 있는 다른 유저들에게만 전송
          socket.to(roomId).emit('chatMessage', {
            ...joinMessage,
            roomId
          });
          
          console.log(`[입장 메시지 전송] 다른 유저들에게 ${nickname}님의 입장 메시지 전송 완료, ID: ${newJoinMessageId}`);
        } else {
          console.log(`[입장 메시지 중복 방지] ${nickname}님의 입장 메시지가 2초 이내에 이미 전송됨. 마지막 전송: ${new Date(lastSent).toISOString()}`);
        }
      }
    } else {
      console.log(`[기존 플레이어 재입장] ${nickname}님은 이미 방에 존재하는 플레이어입니다. 입장 메시지 생성하지 않음.`);
      
      // 플레이어 정보 업데이트 (소켓 ID가 변경되었을 수 있음)
      existingPlayer.socketId = socket.id;
      
      // existingPlayer에 userId가 없고 현재 userId가 있으면 추가
      if (!existingPlayer.userId && userId) {
        existingPlayer.userId = userId;
      }
    }

    console.log(`[채팅 히스토리 전송] ${nickname}님에게 채팅 히스토리 전송, 메시지 수: ${room.messages.length}, 건너뛸 메시지 ID: ${newJoinMessageId}`);
    
    // 채팅 히스토리 전송 (필터링된 메시지)
    socket.emit('chatHistory', {
      roomId,
      messages: room.messages,
      skipMessage: newJoinMessageId // 방금 입장 메시지 ID 전달 (클라이언트에서 필터링)
    });

    // 개인 환영 메시지 전송 (본인에게만 표시)
    // 중복 요청인 경우에는 환영 메시지를 다시 보내지 않음
    if (!isAlreadyInRoom) {
      const welcomeMessage = {
        type: 'system',
        message: `${nickname}님 즐거운 게임 되시기 바랍니다.`,
        timestamp: new Date().toISOString(),
        personal: true // 개인 메시지 플래그 추가
      };
      
      // 개인 환영 메시지는 채팅 히스토리에 저장하지 않고 현재 소켓에만 전송
      console.log(`[개인 환영 메시지 전송] ${nickname}님에게 환영 메시지 전송`);
      socket.emit('chatMessage', {
        ...welcomeMessage,
        roomId
      });
    }

    // 방 정보 전송
    socket.emit('roomInfo', {
      id: room.id,
      title: room.title,
      players: room.players,
      maxPlayers: room.maxPlayers,
      hasPassword: room.hasPassword,
      gameType: room.gameType,
      status: room.status
    });

    // 다른 플레이어들에게 새 플레이어 입장 알림
    io.to(roomId).emit('playerJoined', room.players);
    console.log(`[방 참가 완료] ${nickname}님이 ${roomId} 방에 참가했습니다.`);
  });

  // 방 재입장 처리 (새로고침시 사용)
  socket.on('rejoinRoom', ({ roomId, nickname, userId }) => {
    console.log(`[rejoinRoom 이벤트 수신] 방 ID: ${roomId}, 닉네임: ${nickname}, 사용자 ID: ${userId}`);
    
    // 방이 존재하는지 확인
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('error', { message: '방을 찾을 수 없습니다.' });
      return;
    }
    
    // 사용자 ID 저장
    socket.userId = userId;
    
    // 방 참가
    socket.join(roomId);
    socket.roomId = roomId;
    socket.nickname = nickname;
    
    // 참여 중인 방 정보 업데이트
    if (userId) {
      userRooms.set(userId, roomId);
    }
    
    // 이미 참가한 플레이어인지 확인 (userId로 먼저 확인)
    let player = null;
    if (userId) {
      player = room.players.find(p => p.userId === userId);
    }
    
    // userId로 찾지 못했으면 닉네임으로 찾기
    if (!player) {
      player = room.players.find(p => p.nickname === nickname);
    }
    
    if (player) {
      console.log(`[재입장] ${nickname}님이 방 ${roomId}에 재입장했습니다. (사용자 ID: ${userId})`);
      
      // 플레이어 정보 업데이트
      player.socketId = socket.id;
      
      // userId 업데이트 (없었다면)
      if (!player.userId && userId) {
        player.userId = userId;
      }
      
      // 채팅 히스토리 전송
      socket.emit('chatHistory', {
        roomId,
        messages: room.messages,
        skipMessage: null
      });
      
      // 방 정보 전송
      socket.emit('roomInfo', {
        id: room.id,
        title: room.title,
        players: room.players,
        maxPlayers: room.maxPlayers,
        hasPassword: room.hasPassword,
        gameType: room.gameType,
        status: room.status
      });
      
    } else {
      console.log(`[재입장 오류] ${nickname}님은 방 ${roomId}에 없는 플레이어입니다.`);
      
      // 새로운 플레이어로 간주하고 joinRoom과 동일하게 처리
      socket.emit('error', { message: '세션이 만료되었습니다. 다시 입장해주세요.' });
      navigate('/');
    }
  });

  // 플레이어가 방을 떠날 때의 처리를 함수로 분리
  const handlePlayerLeaveRoom = (socket, room) => {
    const roomId = room.id;
    const nickname = socket.nickname;
    const userId = socket.userId;
    
    if (!nickname) return;
    
    console.log(`[플레이어 퇴장 처리] ${nickname}님이 방 ${roomId}에서 퇴장 처리를 시작합니다.`);
    
    // 이미 최근에 퇴장한 사용자라면 중복 처리하지 않음
    if (room.recentlyLeft && room.recentlyLeft.has(userId || nickname)) {
      console.log(`[퇴장 중복 방지] ${nickname}님은 이미 퇴장 처리되었습니다.`);
      return;
    }
    
    // 최근 퇴장 목록에 추가 (중복 메시지 방지)
    room.recentlyLeft.add(userId || nickname);
    
    // 일정 시간 후 목록에서 제거 (메모리 관리)
    setTimeout(() => {
      if (room.recentlyLeft) {
        room.recentlyLeft.delete(userId || nickname);
        console.log(`[퇴장 처리 완료] ${nickname}님의 퇴장 중복 방지 목록에서 제거됨`);
      }
    }, 5000);
    
    // 플레이어 제거
    room.players = room.players.filter(p => 
      (p.userId && userId) ? p.userId !== userId : p.nickname !== nickname
    );
    
    // 퇴장 메시지 추가 
    if (room.players.length > 0) {
      const messageText = `${nickname}님이 퇴장하셨습니다.`;
      
      // 최근 메시지 확인
      const now = Date.now();
      const messageKey = `system:${messageText}`;
      const lastSent = room.recentMessages.get(messageKey);
      
      // 2초 이내에 같은 메시지가 전송되지 않도록 함
      if (!lastSent || (now - lastSent > 2000)) {
        // 메시지 전송 시간 기록
        room.recentMessages.set(messageKey, now);
        
        const leaveMessage = {
          type: 'system',
          message: messageText,
          timestamp: new Date().toISOString()
        };
        
        console.log(`[퇴장 메시지 생성] ${nickname}님의 퇴장 메시지 생성 시간: ${leaveMessage.timestamp}`);
        room.messages.push(leaveMessage);
        
        // 퇴장 메시지 전송 - 방에 남아있는 모든 유저들에게 전송
        io.to(roomId).emit('chatMessage', {
          ...leaveMessage,
          roomId
        });
      } else {
        console.log(`[퇴장 메시지 중복 방지] ${nickname}님의 퇴장 메시지가 2초 이내에 이미 전송됨. 마지막 전송: ${new Date(lastSent).toISOString()}`);
      }
      
      // 다른 플레이어들에게 퇴장 알림
      io.to(roomId).emit('playerLeft', room.players);
    } else {
      // 방이 비었으면 삭제
      rooms.delete(roomId);
      console.log(`[방 삭제] ${roomId} 방이 비어서 삭제됨`);
    }
  };
  
  // 명시적인 방 퇴장 처리
  socket.on('leaveRoom', () => {
    const roomId = socket.roomId;
    const nickname = socket.nickname;
    
    if (!roomId || !nickname) {
      console.log(`[퇴장 오류] 소켓 ID: ${socket.id}가 방에 참가하지 않았습니다.`);
      return;
    }
    
    const room = rooms.get(roomId);
    if (!room) {
      console.log(`[퇴장 오류] 방 ID: ${roomId}가 존재하지 않습니다.`);
      return;
    }
    
    // 방에서 소켓 연결 해제
    socket.leave(roomId);
    
    // 플레이어 퇴장 처리
    handlePlayerLeaveRoom(socket, room);
    
    // 소켓의 방 정보 초기화
    socket.roomId = null;
    socket.nickname = null;
    
    console.log(`[명시적 퇴장 완료] ${nickname}님이 ${roomId} 방에서 나갔습니다.`);
  });

  // 소켓 연결 해제 이벤트
  socket.on('disconnect', () => {
    const userId = socket.userId;
    const roomId = socket.roomId;
    const nickname = socket.nickname;
    
    console.log(`[소켓 연결 해제] ID: ${socket.id}, 사용자 ID: ${userId}, 닉네임: ${nickname}`);
    
    // 연결된 userId가 있으면 세션 정보 확인
    if (userId) {
      // 현재 소켓 ID와 저장된 소켓 ID가 일치하는 경우에만 세션 정보 삭제
      // (다른 탭/창에서 같은 userId로 새로운 연결이 있을 수 있음)
      const currentSocketId = userSessions.get(userId);
      if (currentSocketId === socket.id) {
        console.log(`[세션 임시 유지] 사용자 ID ${userId}의 세션 정보는 일정 시간 유지됩니다.`);
        
        // 세션 정보를 바로 삭제하지 않고, 일정 시간 후에 삭제 (재연결 가능하도록)
        setTimeout(() => {
          // 시간이 지난 후에도 같은 소켓 ID라면 세션 정보 삭제
          if (userSessions.get(userId) === socket.id) {
            console.log(`[세션 제거] 사용자 ID ${userId}의 세션 정보를 제거합니다.`);
            userSessions.delete(userId);
            userRooms.delete(userId);
          } else {
            console.log(`[세션 유지] 사용자 ID ${userId}가 새 소켓으로 재연결되어 세션을 유지합니다.`);
          }
        }, 30000); // 30초 동안 세션 정보 유지
      } else {
        console.log(`[세션 충돌] 사용자 ID ${userId}에 대한 소켓 ID가 불일치합니다 (${socket.id} != ${currentSocketId})`);
      }
    }
    
    // 방에 참가한 상태였다면 방 정보 업데이트
    if (roomId && nickname) {
      const room = rooms.get(roomId);
      if (room) {
        // 일정 시간 후에 제거 (재연결 가능하도록)
        setTimeout(() => {
          // 시간이 지난 후에도 같은 사용자가 재연결되지 않았다면 방에서 제거
          const isUserReconnected = userId && userSessions.has(userId) && userRooms.get(userId) === roomId;
          
          if (!isUserReconnected) {
            console.log(`[플레이어 제거] ${nickname}님이 재연결되지 않아 방 ${roomId}에서 제거합니다.`);
            handlePlayerLeaveRoom(socket, room);
          } else {
            console.log(`[플레이어 유지] ${nickname}님이 방 ${roomId}에 다시 연결되어 유지합니다.`);
          }
        }, 30000); // 30초 동안 기다림
      }
    }
  });

  // 채팅 메시지 처리
  socket.on('sendMessage', ({ roomId, nickname, message, userId }) => {
    console.log(`[채팅 메시지] 방 ID: ${roomId}, 닉네임: ${nickname}, 사용자 ID: ${userId}`);
    
    const room = rooms.get(roomId);
    if (!room) return;
    
    const chatMessage = {
      type: 'chat',
      nickname,
      message,
      timestamp: new Date().toISOString()
    };
    
    // 메시지 저장
    room.messages.push(chatMessage);
    
    // 룸에 있는 모든 사용자에게 메시지 전송
    io.to(roomId).emit('chatMessage', {
      ...chatMessage,
      roomId
    });
  });

  // 준비 상태 토글
  socket.on('toggleReady', ({ roomId, userId }) => {
    if (!roomId) return;
    
    const room = rooms.get(roomId);
    if (!room) return;
    
    // userId로 먼저 확인하고, 없으면 소켓의 nickname으로 찾기
    let player = null;
    if (userId) {
      player = room.players.find(p => p.userId === userId);
    }
    
    if (!player && socket.nickname) {
      player = room.players.find(p => p.nickname === socket.nickname);
    }
    
    if (!player) return;
    
    // 방장은 준비 상태를 변경할 수 없음 (첫 번째 플레이어가 방장)
    if (player.nickname === room.players[0].nickname) return;
    
    // 관전자는 준비 상태를 변경할 수 없음
    if (player.status === PLAYER_STATUS.SPECTATING) return;
    
    // 이전 상태를 저장
    const prevStatus = player.status;
    
    // 상태 변경: 준비 <-> 대기
    player.status = player.status === PLAYER_STATUS.READY ? 
      PLAYER_STATUS.WAITING : PLAYER_STATUS.READY;
    
    // 모든 플레이어에게 업데이트된 플레이어 정보 전송
    io.to(roomId).emit('playerStatusChanged', room.players);
    
    console.log(`[플레이어 상태 변경] ${player.nickname}님이 ${prevStatus}에서 ${player.status} 상태로 변경되었습니다.`);
  });
  
  // 관전자 상태 토글
  socket.on('toggleSpectator', ({ roomId, userId }) => {
    if (!roomId) return;
    
    const room = rooms.get(roomId);
    if (!room) return;
    
    // userId로 먼저 확인하고, 없으면 소켓의 nickname으로 찾기
    let player = null;
    if (userId) {
      player = room.players.find(p => p.userId === userId);
    }
    
    if (!player && socket.nickname) {
      player = room.players.find(p => p.nickname === socket.nickname);
    }
    
    if (!player) return;
    
    // 방장은 관전자 상태로 변경할 수 없음 (첫 번째 플레이어가 방장)
    if (player.nickname === room.players[0].nickname) return;
    
    // 상태 변경
    if (player.status === PLAYER_STATUS.SPECTATING) {
      // 관전자 -> 참가자
      player.status = PLAYER_STATUS.WAITING;
      
      // 시스템 메시지 추가
      const message = {
        type: 'system',
        message: `${player.nickname}님이 게임에 참가하셨습니다.`,
        timestamp: new Date().toISOString()
      };
      
      room.messages.push(message);
      io.to(roomId).emit('chatMessage', { ...message, roomId });
    } else {
      // 참가자 -> 관전자
      player.status = PLAYER_STATUS.SPECTATING;
      
      // 시스템 메시지 추가
      const message = {
        type: 'system',
        message: `${player.nickname}님이 관전자로 이동하셨습니다.`,
        timestamp: new Date().toISOString()
      };
      
      room.messages.push(message);
      io.to(roomId).emit('chatMessage', { ...message, roomId });
    }
    
    // 모든 플레이어에게 업데이트된 플레이어 정보 전송
    io.to(roomId).emit('playerStatusChanged', room.players);
    
    console.log(`[플레이어 상태 변경] ${player.nickname}님이 ${player.status} 상태로 변경되었습니다.`);
  });
  
  // 플레이어 추방
  socket.on('kickPlayer', ({ roomId, targetNickname }) => {
    const hostNickname = socket.nickname;
    if (!roomId || !hostNickname) return;
    
    const room = rooms.get(roomId);
    if (!room) return;
    
    // 방장인지 확인
    if (room.players[0].nickname !== hostNickname) {
      socket.emit('error', { message: '방장만 추방할 수 있습니다.' });
      return;
    }
    
    // 자기 자신은 추방할 수 없음
    if (targetNickname === hostNickname) {
      socket.emit('error', { message: '자기 자신은 추방할 수 없습니다.' });
      return;
    }
    
    // 추방할 플레이어 찾기
    const targetPlayer = room.players.find(p => p.nickname === targetNickname);
    if (!targetPlayer) {
      socket.emit('error', { message: '해당 플레이어를 찾을 수 없습니다.' });
      return;
    }
    
    console.log(`[플레이어 추방 시도] ${targetNickname}님을 추방 시도 중...`);
    
    // 퇴장 메시지가 중복 표시되지 않도록 처리 - 추방 목록에 미리 추가
    room.recentlyLeft.add(targetNickname);
    
    // 일정 시간 후 목록에서 제거 (메모리 관리)
    setTimeout(() => {
      if (room.recentlyLeft) {
        room.recentlyLeft.delete(targetNickname);
      }
    }, 5000);
    
    // 추방 메시지 생성 - 메시지 통일
    const kickMessage = {
      type: 'system',
      message: `${targetNickname}님이 방에서 추방되었습니다.`,
      timestamp: new Date().toISOString()
    };
    
    // 추방 목록에 추가
    room.bannedUsers.push(targetNickname);
    
    // 플레이어 목록에서 제거
    room.players = room.players.filter(p => p.nickname !== targetNickname);
    
    // 메시지 저장 및 전송
    room.messages.push(kickMessage);
    
    // 타임스탬프 기록 - 중복 메시지 방지
    const messageKey = `system:${kickMessage.message}`;
    room.recentMessages.set(messageKey, Date.now());
    
    // 추방 메시지 전송 - 모든 사용자에게 전송
    io.to(roomId).emit('chatMessage', { ...kickMessage, roomId });
    
    // 플레이어 목록 업데이트
    io.to(roomId).emit('playerStatusChanged', room.players);
    
    // 추방된 유저에게 알림 - 소켓 찾는 방식 수정
    // 현재 방에 있는 모든 소켓을 순회하여 해당 닉네임의 소켓 찾기
    const roomSockets = io.sockets.adapter.rooms.get(roomId);
    if (roomSockets) {
      for (const socketId of roomSockets) {
        const clientSocket = io.sockets.sockets.get(socketId);
        if (clientSocket && clientSocket.nickname === targetNickname) {
          console.log(`[플레이어 추방] 대상 소켓 찾음: ${clientSocket.id}`);
          
          // 추방 플래그 설정 - 퇴장 메시지 중복 방지용
          clientSocket.wasKicked = true;
          
          // 추방 메시지 전송
          clientSocket.emit('kicked', { message: '방장에 의해 추방되었습니다.' });
          
          // 방에서 나가기
          clientSocket.leave(roomId);
          break;
        }
      }
    }
    
    console.log(`[플레이어 추방] ${targetNickname}님이 ${hostNickname}에 의해 추방되었습니다.`);
  });
  
  // 방 설정 변경
  socket.on('updateRoomSettings', ({ roomId, settings }) => {
    const hostNickname = socket.nickname;
    if (!roomId || !hostNickname) return;
    
    const room = rooms.get(roomId);
    if (!room) return;
    
    // 방장인지 확인
    if (room.players[0].nickname !== hostNickname) {
      socket.emit('error', { message: '방장만 설정을 변경할 수 있습니다.' });
      return;
    }
    
    // 방 설정 업데이트
    if (settings.title) room.title = settings.title;
    if (settings.maxPlayers) {
      // 최대 인원 수 변경 시 현재 인원 확인
      const currentPlayerCount = room.players.filter(p => p.status !== PLAYER_STATUS.SPECTATING).length;
      if (currentPlayerCount > settings.maxPlayers) {
        socket.emit('error', { message: '현재 참가자 수보다 적은 인원으로 설정할 수 없습니다.' });
        return;
      }
      room.maxPlayers = settings.maxPlayers;
    }
    if (settings.gameType) room.gameType = settings.gameType;
    if (settings.hasOwnProperty('password')) {
      room.hasPassword = Boolean(settings.password);
      room.password = settings.password || null;
    }
    
    // 시스템 메시지 생성
    const settingsMessage = {
      type: 'system',
      message: `방장이 방 설정을 변경했습니다.`,
      timestamp: new Date().toISOString()
    };
    
    // 메시지 저장 및 전송
    room.messages.push(settingsMessage);
    io.to(roomId).emit('chatMessage', { ...settingsMessage, roomId });
    
    // 모든 플레이어에게 업데이트된 방 정보 전송
    io.to(roomId).emit('roomSettingsUpdated', {
      id: room.id,
      title: room.title,
      maxPlayers: room.maxPlayers,
      hasPassword: room.hasPassword,
      gameType: room.gameType
    });
    
    console.log(`[방 설정 변경] ${hostNickname}님이 방(${roomId}) 설정을 변경했습니다.`);
  });
});

const PORT = process.env.PORT || 3001;
http.listen(PORT, () => {
  console.log(`서버가 ${PORT} 포트에서 실행중입니다.`);
}); 