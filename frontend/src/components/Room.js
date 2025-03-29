import { useState, useEffect, useRef, useContext, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import io from 'socket.io-client';
import { FaUser, FaSignOutAlt, FaEye, FaGamepad, FaCog, FaTimes, FaDice, FaPlayCircle } from 'react-icons/fa';
import { toast } from 'react-toastify';
import '../styles/Room.css';
import { UserContext } from '../context/UserContext';
import { SocketContext } from '../context/SocketContext';

// 게임 타입 상수 정의
const GAME_TYPES = {
  ZOMBIE_DICE: 'ZOMBIE_DICE',
  CAH: 'CAH',
  CAH_ADULT: 'CAH_ADULT'
};

const GAME_INFO = {
  [GAME_TYPES.ZOMBIE_DICE]: {
    name: '좀비 다이스',
    icon: <FaDice />,
    color: 'success'
  },
  [GAME_TYPES.CAH]: {
    name: '비인도적 카드게임',
    icon: <FaPlayCircle />,
    color: 'info'
  },
  [GAME_TYPES.CAH_ADULT]: {
    name: '비인도적 카드게임 (18+)',
    icon: <FaPlayCircle />,
    color: 'danger'
  }
};

const GAME_STATUS = {
  WAITING: 'WAITING',
  IN_PROGRESS: 'IN_PROGRESS'
};

const STATUS_INFO = {
  [GAME_STATUS.WAITING]: {
    label: '대기중',
    color: 'info'
  },
  [GAME_STATUS.IN_PROGRESS]: {
    label: '진행중',
    color: 'warning'
  }
};

function Room({ nickname }) {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [spectators, setSpectators] = useState([]);
  const [messages, setMessages] = useState([]);
  const [messageIds, setMessageIds] = useState(new Set());
  const [inputMessage, setInputMessage] = useState('');
  const [isReady, setIsReady] = useState(false);
  const [isSpectator, setIsSpectator] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    title: '',
    maxPlayers: 4,
    gameType: 'ZOMBIE_DICE',
    password: ''
  });
  const [kickConfirm, setKickConfirm] = useState({ show: false, nickname: null });
  const [isLoading, setIsLoading] = useState(true);
  const hasJoinedRef = useRef(false);
  const receivedRoomInfoRef = useRef(false);
  const timeoutIdRef = useRef(null);
  const chatMessagesRef = useRef();
  
  // 소켓 컨텍스트와 사용자 컨텍스트 사용
  const socket = useContext(SocketContext);
  const { userId } = useContext(UserContext);
  
  // 컴포넌트 언마운트 시 필요한 정리 작업을 수행하는 함수
  const cleanupComponent = useCallback(() => {
    // 타임아웃 정리
    if (timeoutIdRef.current) {
      clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = null;
    }
    
    // 소켓 이벤트 리스너 정리
    if (socket) {
      console.log('이벤트 리스너 정리 중...');
      socket.off('roomInfo');
      socket.off('error');
      socket.off('chatMessage');
      socket.off('chatHistory');
      socket.off('playerJoined');
      socket.off('playerLeft');
      socket.off('playerStatusChanged');
      socket.off('roomSettingsUpdated');
      socket.off('kicked');
      console.log('이벤트 리스너 정리 완료');
    }
  }, [socket]);
  
  // 컴포넌트 마운트 시 방 접속 및 이벤트 리스너 설정
  useEffect(() => {
    console.log('Room 컴포넌트 마운트 - 소켓 연결 및 이벤트 리스너 설정 시작');
    
    // 로딩 상태 활성화
    setIsLoading(true);
    
    // 로그 출력 - 추적용
    console.log(`Room 컴포넌트 마운트: roomId=${roomId}, nickname=${nickname}, userId=${userId}, hasJoined=${hasJoinedRef.current}`);
    
    // 소켓이 아직 연결되지 않았거나 userId가 없으면 대기
    if (!socket || !userId) {
      console.log('소켓 또는 사용자 ID가 아직 준비되지 않음. 대기 중...');
      return;
    }
    
    console.log(`소켓 연결 상태: ${socket.connected ? '연결됨' : '연결되지 않음'}, userId: ${userId}, roomId: ${roomId}`);

    // 컴포넌트 마운트시에 항상 상태를 초기화
    hasJoinedRef.current = false;
    receivedRoomInfoRef.current = false;
    
    // 기존 이벤트 리스너 모두 제거
    cleanupComponent();

    // 소켓 이벤트 리스너 설정
    console.log('이벤트 리스너 설정 중...');
    
    // roomInfo 이벤트 - 방 정보 수신 시
    socket.on('roomInfo', (roomData) => {
      console.log(`roomInfo 이벤트 수신: ${roomData.title}, 플레이어 수: ${roomData.players.length}`);
      
      // 방 정보 수신 표시
      receivedRoomInfoRef.current = true;
      
      // 방 정보 상태 업데이트
      setRoom(roomData);
      setPlayers(roomData.players.filter(p => p.status !== 'SPECTATING'));
      setSpectators(roomData.players.filter(p => p.status === 'SPECTATING'));
      
      // 플레이어 상태 확인
      const player = roomData.players.find(p => p.nickname === nickname);
      if (player) {
        setIsReady(player.status === 'READY');
        setIsSpectator(player.status === 'SPECTATING');
      }
      
      // 방 설정 폼 초기화
      setSettingsForm({
        title: roomData.title,
        maxPlayers: roomData.maxPlayers,
        gameType: roomData.gameType,
        password: roomData.hasPassword ? '********' : ''
      });
      
      // 방 정보를 받았으므로 로딩 상태 비활성화
      setIsLoading(false);
      
      // 타임아웃 해제
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }
    });

    // error 이벤트 - 오류 발생 시
    socket.on('error', ({ message }) => {
      toast.error(message);
      // 오류 발생 시 로딩 상태 비활성화
      setIsLoading(false);
      
      // 타임아웃 해제
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }
      
      navigate('/');
    });

    socket.on('chatMessage', (message) => {
      if (message.roomId === roomId) {
        // 메시지의 고유 ID 생성 (타입 + 내용 + 타임스탬프 조합)
        const messageId = `${message.type}-${message.message}-${message.timestamp}`;
        
        // 타임스탬프 포맷팅 (로그용)
        const timestamp = new Date(message.timestamp);
        const formattedTime = `${timestamp.getHours().toString().padStart(2, '0')}:${timestamp.getMinutes().toString().padStart(2, '0')}:${timestamp.getSeconds().toString().padStart(2, '0')}:${timestamp.getMilliseconds().toString().padStart(3, '0')}`;
        
        // 현재 시간 (로그용)
        const now = new Date();
        const nowFormatted = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}:${now.getMilliseconds().toString().padStart(3, '0')}`;
        
        // 이미 표시된 메시지인지 확인
        if (!messageIds.has(messageId)) {
          // 새 메시지 ID 목록에 추가
          setMessageIds(prev => {
            const newIds = new Set(prev);
            newIds.add(messageId);
            return newIds;
          });
          
          // 메시지 목록에 추가
          setMessages(prev => [...prev, message]);
          
          console.log(`[${nowFormatted}] 메시지 수신 (메시지 시간: ${formattedTime}): ${message.type} - ${message.message}`);
        } else {
          console.log(`[${nowFormatted}] 중복 메시지 필터링 (메시지 시간: ${formattedTime}): ${message.type} - ${message.message}`);
        }
      }
    });
    
    socket.on('chatHistory', ({ messages, skipMessage }) => {
      const now = new Date();
      const nowFormatted = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}:${now.getMilliseconds().toString().padStart(3, '0')}`;
      
      console.log(`[${nowFormatted}] 채팅 히스토리 수신: ${messages.length}개 메시지, 건너뛸 메시지 ID: ${skipMessage}`);
      
      // 새로운 메시지 ID Set 생성
      const newMessageIds = new Set();
      
      // 메시지 필터링 전 추가 로그
      if (skipMessage) {
        console.log(`[${nowFormatted}] 채팅 히스토리에서 제외할 메시지 ID: ${skipMessage}`);
      }
      
      // 자신의 입장 메시지 필터링을 위한 정규식
      const joinPattern = new RegExp(`${nickname}님이 입장하셨습니다`);
      
      // 중복 메시지 필터링하여 표시 (skipMessage 제외)
      const uniqueMessages = messages.filter(msg => {
        const messageId = `${msg.type}-${msg.message}-${msg.timestamp}`;
        const msgTimestamp = new Date(msg.timestamp);
        const msgFormatted = `${msgTimestamp.getHours().toString().padStart(2, '0')}:${msgTimestamp.getMinutes().toString().padStart(2, '0')}:${msgTimestamp.getSeconds().toString().padStart(2, '0')}:${msgTimestamp.getMilliseconds().toString().padStart(3, '0')}`;
        
        // skipMessage와 일치하는 메시지는 제외 (방금 입장한 본인 메시지)
        if (skipMessage === messageId) {
          console.log(`[${nowFormatted}] 건너뛰기 - skipMessage 일치 (${msgFormatted}): ${msg.message}`);
          return false;
        }
        
        // 시스템 메시지이고 자신의 입장 메시지인 경우 (추가 필터링)
        if (msg.type === 'system' && joinPattern.test(msg.message)) {
          console.log(`[${nowFormatted}] 건너뛰기 - 본인 입장 메시지 패턴 일치 (${msgFormatted}): ${msg.message}`);
          return false;
        }
        
        // 이미 표시된 메시지 ID인지 확인 (기존 state와 비교)
        if (messageIds.has(messageId)) {
          console.log(`[${nowFormatted}] 건너뛰기 - 기존 상태에 이미 존재 (${msgFormatted}): ${msg.message}`);
          return false;
        }
        
        // 이번 batch 내에서 중복 메시지 필터링
        if (!newMessageIds.has(messageId)) {
          newMessageIds.add(messageId);
          console.log(`[${nowFormatted}] 히스토리 표시 (${msgFormatted}): ${msg.type} - ${msg.message}`);
          return true;
        }
        
        console.log(`[${nowFormatted}] 히스토리 중복 필터링 (${msgFormatted}): ${msg.type} - ${msg.message}`);
        return false;
      });
      
      console.log(`[${nowFormatted}] 필터링 결과: ${messages.length}개 메시지 중 ${uniqueMessages.length}개 표시`);
      
      // 기존 메시지와 새 메시지 병합 (한번에 상태 업데이트)
      setMessages(prev => {
        // 기존 메시지 ID 집합에 새로운 메시지 ID 추가
        const combinedIds = new Set(messageIds);
        uniqueMessages.forEach(msg => {
          const msgId = `${msg.type}-${msg.message}-${msg.timestamp}`;
          combinedIds.add(msgId);
        });
        
        // 메시지 ID 상태 업데이트
        setMessageIds(combinedIds);
        
        // 중복 없이 메시지 병합
        const combinedMessages = [...prev];
        uniqueMessages.forEach(newMsg => {
          const newMsgId = `${newMsg.type}-${newMsg.message}-${newMsg.timestamp}`;
          
          // 이미 있는 메시지는 추가하지 않음
          const exists = prev.some(existingMsg => 
            `${existingMsg.type}-${existingMsg.message}-${existingMsg.timestamp}` === newMsgId
          );
          
          if (!exists) {
            combinedMessages.push(newMsg);
          }
        });
        
        return combinedMessages;
      });
    });

    socket.on('playerJoined', (updatedPlayers) => {
      setPlayers(updatedPlayers.filter(p => p.status !== 'SPECTATING'));
      setSpectators(updatedPlayers.filter(p => p.status === 'SPECTATING'));
    });

    socket.on('playerLeft', (updatedPlayers) => {
      setPlayers(updatedPlayers.filter(p => p.status !== 'SPECTATING'));
      setSpectators(updatedPlayers.filter(p => p.status === 'SPECTATING'));
    });
    
    socket.on('playerStatusChanged', (updatedPlayers) => {
      setPlayers(updatedPlayers.filter(p => p.status !== 'SPECTATING'));
      setSpectators(updatedPlayers.filter(p => p.status === 'SPECTATING'));
      
      // 내 상태 업데이트
      const player = updatedPlayers.find(p => p.nickname === nickname);
      if (player) {
        setIsReady(player.status === 'READY');
        setIsSpectator(player.status === 'SPECTATING');
      }
    });
    
    socket.on('roomSettingsUpdated', (updatedRoom) => {
      // 방 설정 업데이트
      setRoom(prev => ({ ...prev, ...updatedRoom }));
      
      // 방 설정 폼 업데이트
      setSettingsForm({
        title: updatedRoom.title,
        maxPlayers: updatedRoom.maxPlayers,
        gameType: updatedRoom.gameType,
        password: updatedRoom.hasPassword ? '********' : ''
      });
      
      toast.success('방 설정이 변경되었습니다.');
    });
    
    socket.on('kicked', ({ message }) => {
      const now = new Date();
      const nowFormatted = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}:${now.getMilliseconds().toString().padStart(3, '0')}`;
      
      console.log(`[${nowFormatted}] 추방됨: ${message}`);
      toast.error(message);
      
      // 소켓 연결 종료 처리
      if (socket && !socket.disconnected) {
        console.log(`[${nowFormatted}] 추방으로 인한 소켓 연결 종료`);
        socket.disconnect();
      }
      
      // 추방된 사용자를 로비로 이동시킴 (루트 경로)
      navigate('/');
    });

    // 방 참가 요청 (한 번만 실행되도록 함)
    if (!hasJoinedRef.current) {
      console.log(`joinRoom 이벤트 발송: roomId=${roomId}, nickname=${nickname}, userId=${userId}`);
      
      // 방 참가 요청 보내기 전에 flag 업데이트 (중복 요청 방지)
      hasJoinedRef.current = true;
      
      // 방 참가 요청 전송
      socket.emit('joinRoom', { roomId, nickname, userId });
      
      // 타임아웃 설정 - 5초 후에도 roomInfo를 수신하지 못하면 오류 처리
      timeoutIdRef.current = setTimeout(() => {
        if (!receivedRoomInfoRef.current) {
          console.log('방 입장 타임아웃: 서버 응답 없음');
          setIsLoading(false);
          toast.error('방 입장 중 오류가 발생했습니다. 다시 시도해주세요.');
          navigate('/');
        }
      }, 5000);
    }

    // 컴포넌트 언마운트 시 정리 작업
    return cleanupComponent;
  }, [socket, userId, roomId, nickname, navigate, cleanupComponent]); // 의존성 배열에 cleanupComponent 추가

  // 새 메시지가 추가될 때마다 스크롤을 아래로 이동
  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  }, [messages]);

  const handleLeave = () => {
    console.log('방 나가기 버튼 클릭됨, roomId:', roomId, 'nickname:', nickname);
    
    // 퇴장 처리 중 플래그를 true로 설정
    setIsLoading(true);
    
    try {
      // 명시적으로 서버에 퇴장 알림
      if (socket && socket.connected) {
        socket.emit('leaveRoom');
        console.log('leaveRoom 이벤트 전송 완료');
      }
      
      // 참가 상태 및 방 정보 수신 상태 초기화
      hasJoinedRef.current = false;
      receivedRoomInfoRef.current = false;
      
      // 이벤트 리스너 정리
      cleanupComponent();
      
      // 로비로 이동
      navigate('/');
    } catch (error) {
      console.error('방 나가기 처리 중 오류:', error);
      
      // 오류가 발생해도 로비로 이동
      navigate('/');
    }
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (inputMessage.trim() && socket) {
      socket.emit('sendMessage', { roomId, nickname, message: inputMessage, userId });
      setInputMessage('');
    }
  };
  
  const toggleReady = () => {
    if (socket) {
      socket.emit('toggleReady', { roomId, userId });
    }
  };
  
  const toggleSpectator = () => {
    if (socket) {
      socket.emit('toggleSpectator', { roomId, userId });
    }
  };
  
  const handleKickPlayer = (targetNickname) => {
    // 추방 확인 모달 표시
    console.log('추방 버튼 클릭됨:', targetNickname);
    setKickConfirm({ show: true, nickname: targetNickname });
    console.log('kickConfirm 상태 설정됨:', { show: true, nickname: targetNickname });
  };
  
  const confirmKickPlayer = () => {
    console.log('추방 확인 버튼 클릭됨:', kickConfirm.nickname);
    if (kickConfirm.nickname) {
      // 서버에 추방 요청 전송
      socket.emit('kickPlayer', {
        roomId,
        targetNickname: kickConfirm.nickname
      });
      
      // 시스템 메시지는 서버에서 처리하므로 클라이언트에서는 추가하지 않음
      
      // 모달 닫기
      setKickConfirm({ show: false, nickname: null });
      console.log('추방 요청 전송 및 모달 닫힘');
    }
  };
  
  const cancelKickPlayer = () => {
    console.log('추방 취소 버튼 클릭됨');
    setKickConfirm({ show: false, nickname: null });
    console.log('추방 모달 닫힘');
  };
  
  const handleSettingsChange = (e) => {
    const { name, value } = e.target;
    setSettingsForm(prev => ({
      ...prev,
      [name]: name === 'maxPlayers' ? parseInt(value, 10) : value
    }));
  };
  
  const handleSubmitSettings = () => {
    // 비밀번호가 변경되었는지 확인
    const passwordChanged = settingsForm.password !== '********';
    
    socket.emit('updateRoomSettings', {
      roomId,
      settings: {
        title: settingsForm.title,
        maxPlayers: settingsForm.maxPlayers,
        gameType: settingsForm.gameType,
        // 비밀번호가 변경된 경우에만 전송
        ...(passwordChanged ? { password: settingsForm.password } : {})
      }
    });
    
    // 모달 닫기
    setShowSettingsModal(false);
  };

  // 이 플레이어가 방장인지 확인
  const isHost = () => {
    return players.length > 0 && players[0].nickname === nickname;
  };
  
  // 게임 종목에 따른 태그 스타일 반환
  const getGameTypeTag = (gameType) => {
    if (!GAME_INFO[gameType]) {
      return <span className="badge bg-secondary">기타</span>;
    }
    
    return (
      <span className={`badge bg-${GAME_INFO[gameType].color}`}>
        {GAME_INFO[gameType].icon}
        <span className="ms-1">{GAME_INFO[gameType].name}</span>
      </span>
    );
  };

  // 방 상태에 따른 태그 스타일 반환
  const getRoomStatusTag = (status) => {
    if (!STATUS_INFO[status]) {
      return <span className="badge bg-secondary">알 수 없음</span>;
    }
    
    return (
      <span className={`badge bg-${STATUS_INFO[status].color}`}>
        {STATUS_INFO[status].label}
      </span>
    );
  };

  useEffect(() => {
    console.log('showSettingsModal 상태 변경됨:', showSettingsModal);
  }, [showSettingsModal]);

  useEffect(() => {
    console.log('kickConfirm 상태 변경됨:', kickConfirm);
  }, [kickConfirm]);

  // 로딩 상태 표시 컴포넌트
  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">로딩 중...</span>
        </div>
        <p className="mt-3">방에 입장하는 중...</p>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>로딩중...</p>
      </div>
    );
  }

  return (
    <div className="room-container">
      <div className="room-header">
        <div className="room-title-area">
          {getGameTypeTag(room.gameType)}
          <h2 className="room-title">{room.title}</h2>
          {getRoomStatusTag(room.status)}
        </div>
        <div className="room-actions">
          {isHost() && (
            <button 
              className="settings-button"
              onClick={() => {
                console.log('방 설정 버튼 클릭됨, 이전 상태:', showSettingsModal);
                setShowSettingsModal(true);
                console.log('상태 변경 후:', true);
              }}
            >
              <FaCog className="button-icon" />
              방 설정
            </button>
          )}
          
          {isHost() && (
            <button 
              className="start-button"
              onClick={() => {
                // 게임 시작 로직 추가 필요
                console.log('게임 시작 버튼 클릭됨');
              }}
            >
              <FaGamepad className="button-icon" />
              게임 시작
            </button>
          )}
          
          {!isHost() && !isSpectator && (
            <button 
              className={`ready-button ${isReady ? 'ready-active' : ''}`}
              onClick={toggleReady}
            >
              {isReady ? '준비 취소' : '준비'}
            </button>
          )}
          {!isHost() && (
            isSpectator ? (
              <button 
                className="spectate-button join-game"
                onClick={toggleSpectator}
              >
                <FaGamepad className="button-icon" />
                게임 참가
              </button>
            ) : (
              <button 
                className="spectate-button"
                onClick={toggleSpectator}
              >
                <FaEye className="button-icon" />
                관전하기
              </button>
            )
          )}
          <button 
            className="leave-button"
            onClick={handleLeave}
          >
            <FaSignOutAlt className="button-icon" />
            나가기
          </button>
        </div>
      </div>

      <div className="room-content">
        <div className="room-sidebar">
          {/* 참가자 목록 */}
          <div className="sidebar-section">
            <div className="section-header">
              <h3>참가자 목록</h3>
              <span className="players-count">{players.length + spectators.length}/{room.maxPlayers}명</span>
            </div>
            <div className="section-content">
              <ul className="players-list">
                {players.map(player => (
                  <li key={player.nickname} className="player-item">
                    <div className="player-icon"><FaUser /></div>
                    <div className="player-name">
                      {player.nickname}
                      {player.status === 'READY' && player.nickname !== players[0]?.nickname && (
                        <span className="ready-badge-inline">준비</span>
                      )}
                    </div>
                    <div className="badge-area">
                      {player.nickname === players[0]?.nickname && (
                        <div className="host-badge">방장</div>
                      )}
                      {isHost() && player.nickname !== nickname && (
                        <button 
                          className="kick-button"
                          onClick={() => handleKickPlayer(player.nickname)}
                          title={`${player.nickname} 추방하기`}
                        >
                          추방
                        </button>
                      )}
                    </div>
                  </li>
                ))}
                {players.length === 0 && (
                  <li className="no-players">참가자가 없습니다</li>
                )}
              </ul>
            </div>
          </div>

          {/* 관전자 목록 */}
          <div className="sidebar-section">
            <div className="section-header">
              <h3>관전자 목록</h3>
            </div>
            <div className="section-content">
              <ul className="spectators-list">
                {spectators.map(spectator => (
                  <li key={spectator.nickname} className="spectator-item">
                    <div className="spectator-icon"><FaEye /></div>
                    <div className="player-name">{spectator.nickname}</div>
                    <div className="badge-area">
                      {isHost() && spectator.nickname !== nickname && (
                        <button 
                          className="kick-button"
                          onClick={() => handleKickPlayer(spectator.nickname)}
                          title={`${spectator.nickname} 추방하기`}
                        >
                          추방
                        </button>
                      )}
                    </div>
                  </li>
                ))}
                {spectators.length === 0 && (
                  <li className="no-spectators">관전자가 없습니다</li>
                )}
              </ul>
            </div>
          </div>
        </div>

        {/* 게임 및 채팅 영역 */}
        <div className="room-main">
          <div className="game-area">
            {/* 게임 컴포넌트는 아직 구현하지 않음 */}
            <div className="game-placeholder">
              <h3>채팅</h3>
              <div className="chat-area">
                <div 
                  className="chat-messages"
                  ref={chatMessagesRef}
                >
                  {messages.map((msg, index) => {
                    // 타임스탬프를 파싱하여 포맷팅
                    const timestamp = new Date(msg.timestamp);
                    const formattedTime = `${timestamp.getHours().toString().padStart(2, '0')}:${timestamp.getMinutes().toString().padStart(2, '0')}:${timestamp.getSeconds().toString().padStart(2, '0')}:${timestamp.getMilliseconds().toString().padStart(3, '0')}`;
                    
                    // 개인 메시지인지 확인 (서버에서 personal: true 플래그를 설정)
                    const isPersonal = msg.personal === true;
                    
                    return (
                      <div 
                        key={index} 
                        className={`chat-message ${msg.type === 'system' ? 'system-message' : ''}`}
                      >
                        {msg.type === 'system' ? (
                          <div className="system-text">
                            <span className="message-time">[{formattedTime}] </span>
                            {msg.message}
                          </div>
                        ) : (
                          <>
                            <span className="message-time">[{formattedTime}] </span>
                            <span className="message-sender">{msg.nickname}: </span>
                            <span className="message-text">{msg.message}</span>
                          </>
                        )}
                      </div>
                    );
                  })}
                  {messages.length === 0 && (
                    <div className="no-messages">
                      채팅 메시지가 없습니다
                    </div>
                  )}
                </div>
                <form 
                  className="chat-input-form"
                  onSubmit={handleSendMessage}
                >
                  <input
                    type="text"
                    className="chat-input"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    placeholder="메시지를 입력하세요"
                  />
                  <button type="submit" className="send-button">
                    전송
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* 방 설정 모달 - 테스트용 간단 버전에서 전체 기능 버전으로 업데이트 */}
      {showSettingsModal ? (
        <div 
          className="modal-overlay" 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0, 
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000
          }}
        >
          <div 
            style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              width: '90%',
              maxWidth: '500px',
              overflow: 'hidden'
            }}
          >
            {/* 모달 헤더 */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '16px 20px',
              borderBottom: '1px solid #e9ecef'
            }}>
              <h3 style={{margin: 0, fontSize: '18px', color: '#343a40'}}>방 설정</h3>
              <button 
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '18px',
                  color: '#868e96',
                  cursor: 'pointer',
                  padding: '5px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                onClick={() => setShowSettingsModal(false)}
              >
                <FaTimes />
              </button>
            </div>

            {/* 모달 내용 */}
            <div style={{padding: '20px'}}>
              <form onSubmit={(e) => {
                e.preventDefault(); 
                handleSubmitSettings();
              }}>
                {/* 방 제목 */}
                <div style={{marginBottom: '20px'}}>
                  <label 
                    htmlFor="title" 
                    style={{
                      display: 'block', 
                      marginBottom: '8px', 
                      fontWeight: '500', 
                      color: '#495057',
                      fontSize: '14px'
                    }}
                  >
                    방 제목
                  </label>
                  <input
                    type="text"
                    id="title"
                    name="title"
                    value={settingsForm.title}
                    onChange={handleSettingsChange}
                    required
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #dee2e6',
                      borderRadius: '4px',
                      fontSize: '14px'
                    }}
                  />
                </div>

                {/* 최대 인원 */}
                <div style={{marginBottom: '20px'}}>
                  <label 
                    htmlFor="maxPlayers"
                    style={{
                      display: 'block', 
                      marginBottom: '8px', 
                      fontWeight: '500', 
                      color: '#495057',
                      fontSize: '14px'
                    }}
                  >
                    최대 인원
                  </label>
                  <select
                    id="maxPlayers"
                    name="maxPlayers"
                    value={settingsForm.maxPlayers}
                    onChange={handleSettingsChange}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #dee2e6',
                      borderRadius: '4px',
                      fontSize: '14px'
                    }}
                  >
                    <option value="2">2명</option>
                    <option value="3">3명</option>
                    <option value="4">4명</option>
                    <option value="5">5명</option>
                    <option value="6">6명</option>
                    <option value="8">8명</option>
                  </select>
                </div>

                {/* 게임 종류 */}
                <div style={{marginBottom: '20px'}}>
                  <label 
                    htmlFor="gameType"
                    style={{
                      display: 'block', 
                      marginBottom: '8px', 
                      fontWeight: '500', 
                      color: '#495057',
                      fontSize: '14px'
                    }}
                  >
                    게임 종류
                  </label>
                  <select
                    id="gameType"
                    name="gameType"
                    value={settingsForm.gameType}
                    onChange={handleSettingsChange}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #dee2e6',
                      borderRadius: '4px',
                      fontSize: '14px'
                    }}
                  >
                    <option value="ZOMBIE_DICE">좀비다이스</option>
                    <option value="CAH">비인도적 카드게임</option>
                    <option value="CAH_ADULT">비인도적 카드게임 (18+)</option>
                  </select>
                </div>

                {/* 비밀번호 */}
                <div style={{marginBottom: '20px'}}>
                  <label 
                    htmlFor="password"
                    style={{
                      display: 'block', 
                      marginBottom: '8px', 
                      fontWeight: '500', 
                      color: '#495057',
                      fontSize: '14px'
                    }}
                  >
                    비밀번호 (선택)
                  </label>
                  <input
                    type="password"
                    id="password"
                    name="password"
                    value={settingsForm.password}
                    onChange={handleSettingsChange}
                    placeholder="빈 칸으로 두면 비밀번호 없음"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #dee2e6',
                      borderRadius: '4px',
                      fontSize: '14px'
                    }}
                  />
                  <p style={{
                    marginTop: '8px',
                    fontSize: '12px',
                    color: '#868e96'
                  }}>
                    비밀번호를 변경하려면 새 비밀번호를 입력하세요
                  </p>
                </div>
              </form>
            </div>

            {/* 모달 푸터 */}
            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              padding: '16px 20px',
              borderTop: '1px solid #e9ecef'
            }}>
              <button 
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: '500',
                  fontSize: '14px',
                  backgroundColor: '#e9ecef',
                  color: '#495057'
                }}
                onClick={() => setShowSettingsModal(false)}
              >
                취소
              </button>
              <button 
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: '500',
                  fontSize: '14px',
                  backgroundColor: '#339af0',
                  color: 'white'
                }}
                onClick={handleSubmitSettings}
              >
                저장
              </button>
            </div>
          </div>
        </div>
      ) : null}
      
      {/* 추방 확인 모달 */}
      {kickConfirm.show && (
        <div 
          className="modal-overlay" 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0, 
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000
          }}
        >
          <div 
            style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              width: '90%',
              maxWidth: '400px',
              overflow: 'hidden'
            }}
          >
            {/* 모달 헤더 */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '16px 20px',
              borderBottom: '1px solid #e9ecef'
            }}>
              <h3 style={{margin: 0, fontSize: '18px', color: '#343a40'}}>추방 확인</h3>
            </div>

            {/* 모달 내용 */}
            <div style={{
              padding: '20px',
              textAlign: 'center'
            }}>
              <p style={{
                marginBottom: '8px',
                fontSize: '16px',
                color: '#495057'
              }}>
                정말로 {kickConfirm.nickname}님을 추방하시겠습니까?
              </p>
              <p style={{
                marginTop: '8px',
                fontSize: '12px',
                color: '#868e96'
              }}>
                추방된 유저는 다시 이 방에 참가할 수 없습니다.
              </p>
            </div>

            {/* 모달 푸터 */}
            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              padding: '16px 20px',
              borderTop: '1px solid #e9ecef'
            }}>
              <button 
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: '500',
                  fontSize: '14px',
                  backgroundColor: '#e9ecef',
                  color: '#495057'
                }}
                onClick={cancelKickPlayer}
              >
                취소
              </button>
              <button 
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: '500',
                  fontSize: '14px',
                  backgroundColor: '#ff6b6b',
                  color: 'white'
                }}
                onClick={confirmKickPlayer}
              >
                추방
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Room; 