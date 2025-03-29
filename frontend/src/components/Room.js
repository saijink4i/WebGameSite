import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import io from 'socket.io-client';
import { FaUser, FaSignOutAlt, FaEye, FaGamepad, FaCog, FaTimes } from 'react-icons/fa';
import { toast } from 'react-toastify';
import '../styles/Room.css';

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
  const socketRef = useRef();
  const chatMessagesRef = useRef();
  const hasJoinedRef = useRef(false); // 중복 joinRoom 요청 방지를 위한 플래그

  useEffect(() => {
    console.log('Room 컴포넌트 마운트 - 소켓 연결 및 이벤트 리스너 설정 시작');
    
    // 이미 연결된 소켓이 있다면 재사용
    if (!socketRef.current) {
      console.log('소켓 생성: 새로운 소켓 연결을 생성합니다');
      socketRef.current = io('http://localhost:3001');
    } else if (!socketRef.current.connected) {
      console.log('소켓 재연결: 연결이 끊긴 소켓을 다시 연결합니다');
      socketRef.current.connect();
    } else {
      console.log('기존 소켓 사용: 이미 연결된 소켓을 재사용합니다');
    }

    // 소켓 이벤트 리스너 설정 (중복 등록 방지를 위해 먼저 제거)
    const setupEventListeners = () => {
      // 기존 이벤트 리스너 제거
      socketRef.current.off('roomInfo');
      socketRef.current.off('error');
      socketRef.current.off('chatMessage');
      socketRef.current.off('chatHistory');
      socketRef.current.off('playerJoined');
      socketRef.current.off('playerLeft');
      socketRef.current.off('playerStatusChanged');
      socketRef.current.off('roomSettingsUpdated');
      socketRef.current.off('kicked');

      // 이벤트 리스너 재설정
      socketRef.current.on('roomInfo', (roomData) => {
        console.log(`roomInfo 이벤트 수신: ${roomData.title}, 플레이어 수: ${roomData.players.length}`);
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
      });

      socketRef.current.on('error', ({ message }) => {
        toast.error(message);
        navigate('/');
      });

      socketRef.current.on('chatMessage', (message) => {
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
      
      socketRef.current.on('chatHistory', ({ messages, skipMessage }) => {
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

      socketRef.current.on('playerJoined', (updatedPlayers) => {
        setPlayers(updatedPlayers.filter(p => p.status !== 'SPECTATING'));
        setSpectators(updatedPlayers.filter(p => p.status === 'SPECTATING'));
      });

      socketRef.current.on('playerLeft', (updatedPlayers) => {
        setPlayers(updatedPlayers.filter(p => p.status !== 'SPECTATING'));
        setSpectators(updatedPlayers.filter(p => p.status === 'SPECTATING'));
      });
      
      socketRef.current.on('playerStatusChanged', (updatedPlayers) => {
        setPlayers(updatedPlayers.filter(p => p.status !== 'SPECTATING'));
        setSpectators(updatedPlayers.filter(p => p.status === 'SPECTATING'));
        
        // 내 상태 업데이트
        const player = updatedPlayers.find(p => p.nickname === nickname);
        if (player) {
          setIsReady(player.status === 'READY');
          setIsSpectator(player.status === 'SPECTATING');
        }
      });
      
      socketRef.current.on('roomSettingsUpdated', (updatedRoom) => {
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
      
      socketRef.current.on('kicked', ({ message }) => {
        const now = new Date();
        const nowFormatted = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}:${now.getMilliseconds().toString().padStart(3, '0')}`;
        
        console.log(`[${nowFormatted}] 추방됨: ${message}`);
        toast.error(message);
        
        // 소켓 연결 종료 처리
        if (socketRef.current && !socketRef.current.disconnected) {
          console.log(`[${nowFormatted}] 추방으로 인한 소켓 연결 종료`);
          socketRef.current.disconnect();
        }
        
        // 추방된 사용자를 로비로 이동시킴 (루트 경로)
        navigate('/');
      });
    };

    // 이벤트 리스너 설정
    setupEventListeners();

    // 방 참가 요청 (한 번만 실행되도록 함)
    if (!hasJoinedRef.current) {
      console.log(`joinRoom 이벤트 발송: roomId=${roomId}, nickname=${nickname}`);
      socketRef.current.emit('joinRoom', { roomId, nickname });
      hasJoinedRef.current = true; // 참가 완료 플래그 설정
    } else {
      console.log(`이미 방에 참가했으므로 joinRoom 이벤트를 다시 발송하지 않습니다`);
    }

    // 클린업
    return () => {
      console.log('Room 컴포넌트 언마운트 - 소켓 연결 종료');
      // 컴포넌트가 언마운트될 때만 소켓 연결 종료
      if (socketRef.current && !socketRef.current.disconnected) {
        socketRef.current.disconnect();
      }
    };
  }, []); // 의존성 배열을 비워서 한 번만 실행되도록 함

  // roomId나 nickname이 변경되면 방 재접속 처리
  useEffect(() => {
    // 이전에 다른 방에 접속했었다면 재접속 처리
    if (hasJoinedRef.current && socketRef.current && socketRef.current.connected) {
      console.log(`방 정보 변경 감지 - 재접속: roomId=${roomId}, nickname=${nickname}`);
      
      // 기존 참가 플래그 초기화
      hasJoinedRef.current = false;
      
      // 소켓 재연결
      socketRef.current.disconnect();
      
      // 실제 컴포넌트 리렌더링을 통해 첫 번째 useEffect가 다시 실행되도록 함
      setTimeout(() => {
        socketRef.current.connect();
      }, 100);
    }
  }, [roomId, nickname]);

  // 새 메시지가 추가될 때마다 스크롤을 아래로 이동
  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  }, [messages]);

  const handleLeave = () => {
    console.log('방 나가기 버튼 클릭됨, roomId:', roomId, 'nickname:', nickname);
    
    try {
      // 명시적으로 서버에 퇴장 알림
      socketRef.current.emit('leaveRoom');
      console.log('leaveRoom 이벤트 전송 완료');
      
      // 잠시 대기 후 소켓 연결 종료 (서버가 메시지를 처리할 시간 확보)
      setTimeout(() => {
        try {
          // 소켓이 아직 연결되어 있을 경우만 연결 종료
          if (socketRef.current && !socketRef.current.disconnected) {
            // 소켓 연결 종료
            socketRef.current.disconnect();
            console.log('소켓 연결 종료 완료');
          }
          
          // 로비로 이동
          navigate('/');
        } catch (error) {
          console.error('소켓 연결 종료 중 오류:', error);
          // 오류가 발생해도 로비로 이동
          navigate('/');
        }
      }, 300); // 시간을 약간 늘려서 서버가 처리할 시간 확보
    } catch (error) {
      console.error('방 나가기 처리 중 오류:', error);
      // 오류가 발생해도 로비로 이동
      if (socketRef.current && !socketRef.current.disconnected) {
        socketRef.current.disconnect();
      }
      navigate('/');
    }
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (inputMessage.trim()) {
      socketRef.current.emit('sendMessage', {
        roomId,
        nickname,
        message: inputMessage
      });
      setInputMessage('');
    }
  };
  
  const toggleReady = () => {
    socketRef.current.emit('toggleReady');
  };
  
  const toggleSpectator = () => {
    socketRef.current.emit('toggleSpectator');
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
      socketRef.current.emit('kickPlayer', {
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
    
    socketRef.current.emit('updateRoomSettings', {
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
    switch (gameType) {
      case 'ZOMBIE_DICE':
        return <span className="tag zombie-dice">좀비다이스</span>;
      case 'UNO':
        return <span className="tag uno">우노</span>;
      case 'YACHT':
        return <span className="tag yacht">요트다이스</span>;
      default:
        return <span className="tag">기타</span>;
    }
  };

  useEffect(() => {
    console.log('showSettingsModal 상태 변경됨:', showSettingsModal);
  }, [showSettingsModal]);

  useEffect(() => {
    console.log('kickConfirm 상태 변경됨:', kickConfirm);
  }, [kickConfirm]);

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
                  onSubmit={sendMessage}
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
                    <option value="UNO">우노</option>
                    <option value="YACHT">요트다이스</option>
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