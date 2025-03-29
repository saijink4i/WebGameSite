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

// 소켓 연결 설정
io.on('connection', (socket) => {
  console.log(`[소켓 연결] ID: ${socket.id}`);
  
  // 방 참가
  socket.on('joinRoom', ({ roomId, nickname }) => {
    console.log(`[joinRoom 이벤트 수신] 방 ID: ${roomId}, 닉네임: ${nickname}, 소켓 ID: ${socket.id}`);
    
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

    // 동일 소켓이 여러번 joinRoom 요청을 보내는 경우 방지
    if (socket.roomId === roomId && socket.nickname === nickname) {
      console.log(`[중복 참가 요청 무시] 소켓 ID: ${socket.id}는 이미 ${roomId} 방에 ${nickname}으로 참가 중입니다.`);
      
      // 기존 채팅 히스토리만 다시 전송
      socket.emit('chatHistory', {
        roomId,
        messages: room.messages,
        skipMessage: null
      });
      
      return;
    }

    socket.join(roomId);
    socket.roomId = roomId;
    socket.nickname = nickname;

    // 이미 참가한 플레이어인지 확인
    const existingPlayer = room.players.find(p => p.nickname === nickname);
    
    // 방금 입장한 사용자 본인의 메시지 ID 저장 (중복 방지용)
    let newJoinMessageId = null;
    
    // 새로운 플레이어만 추가
    if (!existingPlayer) {
      console.log(`[신규 플레이어 입장] ${nickname}님은 신규 플레이어로 입장`);
      
      // 최근 입장 목록에 있는지 확인 (중복 메시지 방지)
      if (room.recentlyJoined.has(nickname)) {
        console.log(`[입장 중복 방지] ${nickname}님은 이미 입장 처리되었습니다. 메시지 표시하지 않음.`);
      } else {
        // 플레이어 목록에 추가
        room.players.push({
          nickname: nickname,
          status: PLAYER_STATUS.WAITING
        });
        
        // 최근 입장 목록에 추가 (중복 메시지 방지용)
        room.recentlyJoined.add(nickname);
        console.log(`[입장 중복 방지 목록 추가] ${nickname}님을 recentlyJoined 목록에 추가함`);
        
        // 일정 시간 후 목록에서 제거 (메모리 관리)
        setTimeout(() => {
          if (room.recentlyJoined) {
            room.recentlyJoined.delete(nickname);
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
    }

    console.log(`[채팅 히스토리 전송] ${nickname}님에게 채팅 히스토리 전송, 메시지 수: ${room.messages.length}, 건너뛸 메시지 ID: ${newJoinMessageId}`);
    
    // 채팅 히스토리 전송 (필터링된 메시지)
    socket.emit('chatHistory', {
      roomId,
      messages: room.messages,
      skipMessage: newJoinMessageId // 방금 입장 메시지 ID 전달 (클라이언트에서 필터링)
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

    // 다른 플레이어들에게 새 플레이어 입장 알림
    io.to(roomId).emit('playerJoined', room.players);
    console.log(`[방 참가 완료] ${nickname}님이 ${roomId} 방에 참가했습니다.`);
  });

  // 채팅 메시지 처리
  socket.on('sendMessage', ({ roomId, nickname, message }) => {
    console.log(`[채팅 메시지] 방 ID: ${roomId}, 닉네임: ${nickname}, 메시지: ${message}`);
    
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
  socket.on('toggleReady', () => {
    const roomId = socket.roomId;
    const nickname = socket.nickname;
    if (!roomId || !nickname) return;
    
    const room = rooms.get(roomId);
    if (!room) return;
    
    const player = room.players.find(p => p.nickname === nickname);
    if (!player) return;
    
    // 방장은 준비 상태를 변경할 수 없음 (첫 번째 플레이어가 방장)
    if (player.nickname === room.players[0].nickname) return;
    
    // 관전자는 준비 상태를 변경할 수 없음
    if (player.status === PLAYER_STATUS.SPECTATING) return;
    
    player.status = player.status === PLAYER_STATUS.READY ? 
      PLAYER_STATUS.WAITING : PLAYER_STATUS.READY;
    
    // 모든 플레이어에게 업데이트된 플레이어 정보 전송
    io.to(roomId).emit('playerStatusChanged', room.players);
    
    console.log(`[플레이어 상태 변경] ${nickname}님이 ${player.status} 상태로 변경되었습니다.`);
  });
  
  // 관전자 상태 토글
  socket.on('toggleSpectator', () => {
    const roomId = socket.roomId;
    const nickname = socket.nickname;
    if (!roomId || !nickname) return;
    
    const room = rooms.get(roomId);
    if (!room) return;
    
    const player = room.players.find(p => p.nickname === nickname);
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
        message: `${nickname}님이 게임에 참가하셨습니다.`,
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
        message: `${nickname}님이 관전자로 이동하셨습니다.`,
        timestamp: new Date().toISOString()
      };
      
      room.messages.push(message);
      io.to(roomId).emit('chatMessage', { ...message, roomId });
    }
    
    // 모든 플레이어에게 업데이트된 플레이어 정보 전송
    io.to(roomId).emit('playerStatusChanged', room.players);
    
    console.log(`[플레이어 상태 변경] ${nickname}님이 ${player.status} 상태로 변경되었습니다.`);
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

  // 방 나가기
  socket.on('leaveRoom', () => {
    const roomId = socket.roomId;
    const nickname = socket.nickname;
    if (!roomId || !nickname) return;

    console.log(`[명시적 퇴장 요청] ${nickname}님이 roomId: ${roomId}에서 퇴장 요청`);
    
    // 명시적으로 방을 나가는 경우만 퇴장 메시지 처리
    const room = rooms.get(roomId);
    if (!room) return;
    
    // 이미 해당 플레이어가 방에 존재하지 않으면 처리하지 않음
    if (!room.players.some(p => p.nickname === nickname)) {
      console.log(`[퇴장 요청 무시] ${nickname}님은 이미 방에 존재하지 않습니다.`);
      return;
    }
    
    // 이미 최근에 퇴장한 사용자라면 중복 처리하지 않음
    if (room.recentlyLeft && room.recentlyLeft.has(nickname)) {
      console.log(`[퇴장 중복 방지] ${nickname}님은 이미 퇴장 처리되었습니다. 메시지 표시하지 않음.`);
      return;
    }
    
    // 최근 퇴장 목록에 추가 (중복 메시지 방지)
    room.recentlyLeft.add(nickname);
    
    // 일정 시간 후 목록에서 제거 (메모리 관리)
    setTimeout(() => {
      if (room.recentlyLeft) {
        room.recentlyLeft.delete(nickname);
        console.log(`[퇴장 처리 완료] ${nickname}님의 퇴장 중복 방지 목록에서 제거됨`);
      }
    }, 5000);

    // 플레이어 제거
    room.players = room.players.filter(p => p.nickname !== nickname);
    
    // 퇴장 메시지 추가 (명시적 퇴장인 경우에는 항상 메시지 표시)
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
        
        // 퇴장 메시지 전송 - 다른 사용자들에게만 전송 (현재 퇴장하는 사용자는 이미 떠나고 있음)
        socket.to(roomId).emit('chatMessage', {
          ...leaveMessage,
          roomId
        });
      } else {
        console.log(`[퇴장 메시지 중복 방지] ${nickname}님의 퇴장 메시지가 2초 이내에 이미 전송됨. 마지막 전송: ${new Date(lastSent).toISOString()}`);
      }
      
      // 다른 플레이어들에게 퇴장 알림
      socket.to(roomId).emit('playerLeft', room.players);
    } else {
      // 방이 비었으면 삭제
      rooms.delete(roomId);
      console.log(`[방 삭제] ${roomId} 방이 비어서 삭제됨`);
    }
    
    socket.leave(roomId);
    console.log(`[명시적 퇴장 완료] ${nickname}님이 ${roomId} 방에서 나갔습니다.`);
  });

  // 연결 종료
  socket.on('disconnect', () => {
    console.log(`[소켓 연결 종료] ID: ${socket.id}`);
    
    const roomId = socket.roomId;
    const nickname = socket.nickname;
    
    if (!roomId || !nickname) return;
    
    const room = rooms.get(roomId);
    if (!room) return;
    
    // 추방된 사용자면 퇴장 메시지 표시하지 않음
    if (socket.wasKicked) {
      console.log(`[연결 종료 - 추방된 사용자] ${nickname}님은 추방되어 퇴장 메시지를 표시하지 않습니다.`);
      return;
    }
    
    // 이미 최근에 퇴장한 사용자라면 중복 처리하지 않음
    if (room.recentlyLeft && room.recentlyLeft.has(nickname)) {
      console.log(`[연결 종료 중복 방지] ${nickname}님은 이미 퇴장 처리되었습니다.`);
      return;
    }
    
    // handlePlayerLeave 대신 직접 처리
    console.log(`[연결 종료로 인한 퇴장] ${nickname}님의 연결이 종료되어 퇴장 처리`);
    
    // 최근 퇴장 목록에 추가 (중복 메시지 방지)
    room.recentlyLeft.add(nickname);
    
    // 일정 시간 후 목록에서 제거 (메모리 관리)
    setTimeout(() => {
      if (room.recentlyLeft) {
        room.recentlyLeft.delete(nickname);
        console.log(`[연결 종료 퇴장 처리 완료] ${nickname}님의 퇴장 중복 방지 목록에서 제거됨`);
      }
    }, 5000);
    
    // 플레이어 제거
    room.players = room.players.filter(p => p.nickname !== nickname);
    
    // 퇴장 메시지 추가 (연결 종료로 인한 퇴장인 경우)
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
        
        console.log(`[연결 종료 퇴장 메시지 생성] ${nickname}님의 퇴장 메시지 생성 시간: ${leaveMessage.timestamp}`);
        room.messages.push(leaveMessage);
        
        // 퇴장 메시지 전송 - 방에 남아있는 모든 유저들에게 전송
        io.to(roomId).emit('chatMessage', {
          ...leaveMessage,
          roomId
        });
      } else {
        console.log(`[연결 종료 퇴장 메시지 중복 방지] ${nickname}님의 퇴장 메시지가 2초 이내에 이미 전송됨. 마지막 전송: ${new Date(lastSent).toISOString()}`);
      }
      
      // 다른 플레이어들에게 퇴장 알림
      io.to(roomId).emit('playerLeft', room.players);
    } else {
      // 방이 비었으면 삭제
      rooms.delete(roomId);
      console.log(`[방 삭제] ${roomId} 방이 비어서 삭제됨`);
    }
  });
});

const PORT = process.env.PORT || 3001;
http.listen(PORT, () => {
  console.log(`서버가 ${PORT} 포트에서 실행중입니다.`);
}); 