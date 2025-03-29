import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { FaLock, FaUser, FaDice, FaPlayCircle } from 'react-icons/fa';
import { toast } from 'react-toastify';

// axios 기본 설정 추가
axios.defaults.maxContentLength = Infinity;
axios.defaults.maxBodyLength = Infinity;

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

// 필터 타입 상수 정의
const FILTER_TYPES = {
  GAME: 'GAME',
  JOINABLE: 'JOINABLE',
  LOCKED: 'LOCKED',
  STATUS: 'STATUS'
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

function NicknameModal({ currentNickname, onSubmit, onClose, canClose }) {
  const [inputValue, setInputValue] = useState(currentNickname || '');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputValue.trim()) {
      onSubmit(inputValue);
      if (canClose) {
        onClose();
      }
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content bg-white p-4 rounded-3">
        <h2 className="mb-4">닉네임 설정</h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="form-label">닉네임</label>
            <input
              type="text"
              className="form-control"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="닉네임을 입력하세요"
              required
            />
          </div>
          <div className="d-flex justify-content-end gap-2">
            <button type="submit" className="btn btn-primary">확인</button>
            {canClose && (
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                취소
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function CreateRoomModal({ onClose, onCreate }) {
  const [roomTitle, setRoomTitle] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [password, setPassword] = useState('');
  const [gameType, setGameType] = useState(GAME_TYPES.ZOMBIE_DICE);

  const handleSubmit = (e) => {
    e.preventDefault();
    onCreate({
      title: roomTitle,
      maxPlayers: parseInt(maxPlayers),
      password: password,
      gameType: gameType
    });
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content bg-white p-4 rounded-3">
        <h2 className="mb-4">방 만들기</h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="form-label">게임 선택</label>
            <select 
              className="form-select"
              value={gameType}
              onChange={(e) => setGameType(e.target.value)}
            >
              {Object.entries(GAME_TYPES).map(([key, value]) => (
                <option key={key} value={value}>
                  {GAME_INFO[value].name}
                </option>
              ))}
            </select>
          </div>
          <div className="mb-3">
            <label className="form-label">방 제목</label>
            <input
              type="text"
              className="form-control"
              value={roomTitle}
              onChange={(e) => setRoomTitle(e.target.value)}
              required
              placeholder="방 제목을 입력하세요"
            />
          </div>
          <div className="mb-3">
            <label className="form-label">최대 인원</label>
            <select
              className="form-select"
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(Number(e.target.value))}
            >
              {Array.from({length: 19}, (_, i) => i + 2).map(num => (
                <option key={num} value={num}>{num}명</option>
              ))}
            </select>
          </div>
          <div className="mb-3">
            <label className="form-label">비밀번호 (선택)</label>
            <input
              type="password"
              className="form-control"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호를 입력하세요"
            />
          </div>
          <div className="d-flex justify-content-end gap-2">
            <button type="submit" className="btn btn-primary">만들기</button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              취소
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PasswordModal({ room, onSubmit, onClose }) {
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(password);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content bg-white p-4 rounded-3">
        <h2 className="mb-4">비밀번호 입력</h2>
        <p><strong>{room.title}</strong> 방에 입장하기 위한 비밀번호를 입력하세요.</p>
        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="form-label">비밀번호</label>
            <input
              type="password"
              className="form-control"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호를 입력하세요"
              required
              autoFocus
            />
          </div>
          <div className="d-flex justify-content-end gap-2">
            <button type="submit" className="btn btn-primary">입장</button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              취소
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FilterBar({ filters, onFilterChange }) {
  const handleGameTypeChange = (e) => {
    onFilterChange(FILTER_TYPES.GAME, e.target.value || null);
  };

  const handleJoinableChange = (e) => {
    onFilterChange(FILTER_TYPES.JOINABLE, e.target.checked);
  };

  const handleLockedChange = (e) => {
    onFilterChange(FILTER_TYPES.LOCKED, e.target.value);
  };

  const handleStatusChange = (e) => {
    onFilterChange(FILTER_TYPES.STATUS, e.target.value || null);
  };

  return (
    <div className="card mb-4">
      <div className="card-body">
        <h5 className="card-title mb-3">필터</h5>
        <div className="row g-3">
          <div className="col-md-4">
            <label className="form-label">게임</label>
            <select 
              className="form-select"
              value={filters[FILTER_TYPES.GAME] || ''}
              onChange={handleGameTypeChange}
            >
              <option value="">모든 게임</option>
              {Object.entries(GAME_TYPES).map(([key, value]) => (
                <option key={key} value={value}>
                  {GAME_INFO[value].name}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label">잠금 상태</label>
            <select 
              className="form-select"
              value={filters[FILTER_TYPES.LOCKED] || ''}
              onChange={handleLockedChange}
            >
              <option value="">모든 방</option>
              <option value="locked">잠긴 방만</option>
              <option value="unlocked">열린 방만</option>
            </select>
          </div>
          <div className="col-md-4 d-flex align-items-end">
            <div className="form-check">
              <input
                className="form-check-input"
                type="checkbox"
                id="joinableOnly"
                checked={filters[FILTER_TYPES.JOINABLE] || false}
                onChange={handleJoinableChange}
              />
              <label className="form-check-label" htmlFor="joinableOnly">
                참가 가능한 방만 보기
              </label>
            </div>
          </div>
          <div className="col-md-3">
            <label className="form-label">진행 상태</label>
            <select 
              className="form-select"
              value={filters[FILTER_TYPES.STATUS] || ''}
              onChange={handleStatusChange}
            >
              <option value="">모든 상태</option>
              <option value={GAME_STATUS.WAITING}>대기중</option>
              <option value={GAME_STATUS.IN_PROGRESS}>진행중</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

function Lobby({ nickname: initialNickname, setNickname, userId }) {
  const [rooms, setRooms] = useState([]);
  const [showNicknameModal, setShowNicknameModal] = useState(!initialNickname);
  const [showCreateRoomModal, setShowCreateRoomModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [nickname, setLocalNickname] = useState(initialNickname || '');
  const [filters, setFilters] = useState({
    gameType: null,
    joinableOnly: false,
    locked: 'all',
    status: null
  });
  const navigate = useNavigate();
  
  // userId 값이 변경될 때 로그 출력
  useEffect(() => {
    console.log(`Lobby에 전달된 userId: ${userId}`);
  }, [userId]);

  // 컴포넌트 마운트 시 방 목록 로드 및 주기적 업데이트
  useEffect(() => {
    console.log("방 목록 로드 시작");
    // 초기 로드
    fetchRooms();
    
    // 주기적 업데이트 설정 (3초마다)
    const interval = setInterval(() => {
      fetchRooms();
    }, 3000);
    
    // 컴포넌트 언마운트 시 인터벌 정리
    return () => {
      console.log("방 목록 로드 정리");
      clearInterval(interval);
    };
  }, []); // 빈 의존성 배열: 컴포넌트 마운트 시 한 번만 실행

  // 방 목록 가져오기
  const fetchRooms = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/rooms');
      console.log("방 목록 가져오기 성공:", response.data);
      setRooms(response.data);
    } catch (error) {
      console.error('방 목록 가져오기 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  // 닉네임 변경 처리
  const handleNicknameChange = (newNickname) => {
    setLocalNickname(newNickname);
    setNickname(newNickname); // 부모 컴포넌트에 설정
    sessionStorage.setItem('nickname', newNickname);
    setShowNicknameModal(false);
  };

  // 방 생성
  const createRoom = async (roomData) => {
    if (!nickname) {
      setShowNicknameModal(true);
      return;
    }
    
    try {
      setLoading(true);
      const response = await axios.post('/api/rooms', {
        creator: nickname,
        title: roomData.title || `${nickname}의 방`,
        maxPlayers: roomData.maxPlayers || 4,
        password: roomData.password || null,
        gameType: roomData.gameType || GAME_TYPES.ZOMBIE_DICE,
        userId: userId // 사용자 ID 추가
      });
      
      setShowCreateRoomModal(false);
      navigate(`/room/${response.data.roomId}`);
    } catch (error) {
      console.error('방 생성 오류:', error);
      setLoading(false);
    }
  };
  
  // 방 입장
  const joinRoom = async (room) => {
    if (!nickname) {
      setShowNicknameModal(true);
      return;
    }
    
    // 비밀번호 필요한 방인 경우
    if (room.hasPassword && !selectedRoom) {
      setSelectedRoom(room);
      setPasswordInput("");
      return;
    }
    
    try {
      // 로딩 상태 활성화 (입장 시도 중)
      setLoading(true);
      
      // 비밀번호 검증 요청 (필요한 경우)
      if (room.hasPassword && passwordInput) {
        const validateResponse = await axios.post('/api/rooms/validate-password', {
          roomId: room.id,
          password: passwordInput,
          userId: userId // 사용자 ID 추가
        });
        
        if (!validateResponse.data.valid) {
          toast.error('비밀번호가 일치하지 않습니다.');
          setLoading(false);
          return;
        }
      }
      
      // 세션 스토리지에 최근 방문한 방 ID 저장 (디버깅 용도)
      const previousRoomId = sessionStorage.getItem('lastRoomId');
      if (previousRoomId) {
        console.log(`이전에 방문한 방 ID: ${previousRoomId}, 새로 입장하는 방 ID: ${room.id}`);
      }
      sessionStorage.setItem('lastRoomId', room.id);
      
      // 방으로 이동
      navigate(`/room/${room.id}`);
    } catch (error) {
      console.error('방 입장 오류:', error);
      toast.error('방 입장 중 오류가 발생했습니다.');
      setLoading(false);
    }
  };

  // 닉네임이 없는 경우 방 생성과 참가를 막기 위해 조건 추가
  const canInteract = Boolean(nickname);

  const handleFilterChange = (filterType, value) => {
    setFilters(prev => ({
      ...prev,
      [filterType]: value === '' ? null : value
    }));
  };

  const filterRooms = (rooms) => {
    return rooms.filter(room => {
      // 게임 타입 필터
      if (filters[FILTER_TYPES.GAME] && room.gameType !== filters[FILTER_TYPES.GAME]) {
        return false;
      }

      // 참가 가능 여부 필터
      if (filters[FILTER_TYPES.JOINABLE] && room.players.length >= room.maxPlayers) {
        return false;
      }

      // 잠금 상태 필터
      if (filters[FILTER_TYPES.LOCKED]) {
        if (filters[FILTER_TYPES.LOCKED] === 'locked' && !room.hasPassword) {
          return false;
        }
        if (filters[FILTER_TYPES.LOCKED] === 'unlocked' && room.hasPassword) {
          return false;
        }
      }

      // 상태 필터
      if (filters[FILTER_TYPES.STATUS] && room.status !== filters[FILTER_TYPES.STATUS]) {
        return false;
      }

      return true;
    });
  };

  // 비밀번호 입력 후 방 입장
  const handlePasswordSubmit = (password) => {
    if (selectedRoom) {
      setPasswordInput(password);
      joinRoom(selectedRoom);
      setSelectedRoom(null);
    }
  };

  // 비밀번호 모달 닫기
  const handleClosePasswordModal = () => {
    setSelectedRoom(null);
    setPasswordInput("");
  };

  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1>게임 로비</h1>
        {nickname && (
          <div 
            className="d-flex align-items-center gap-2 px-3 py-2 border rounded cursor-pointer"
            onClick={() => setShowNicknameModal(true)}
          >
            <FaUser className="text-secondary" />
            <span>{nickname}</span>
          </div>
        )}
      </div>

      <div className="mb-4">
        <button 
          className="btn btn-primary"
          onClick={() => setShowCreateRoomModal(true)}
          disabled={!canInteract}
        >
          방 만들기
        </button>
      </div>

      <FilterBar 
        filters={filters}
        onFilterChange={handleFilterChange}
      />
      
      <div className="list-group">
        {filterRooms(rooms).map(room => (
          <div key={room.id} className="list-group-item d-flex justify-content-between align-items-center">
            <div className="d-flex align-items-center flex-grow-1 gap-2">
              <span className={`badge bg-${GAME_INFO[room.gameType].color}`}>
                {GAME_INFO[room.gameType].icon}
                <span className="ms-1">{GAME_INFO[room.gameType].name}</span>
              </span>
              {room.hasPassword && <FaLock className="text-secondary" />}
              <span className="fw-semibold text-truncate">{room.title || `${room.players[0]}의 방`}</span>
              <span className={`badge bg-${STATUS_INFO[room.status].color}`}>
                {STATUS_INFO[room.status].label}
              </span>
              <span className="badge bg-secondary">
                {room.players.length}/{room.maxPlayers}명
              </span>
            </div>
            <button 
              className="btn btn-outline-primary ms-2"
              onClick={() => joinRoom(room)}
              disabled={!canInteract || room.players.length >= room.maxPlayers}
            >
              참가하기
            </button>
          </div>
        ))}
        {filterRooms(rooms).length === 0 && (
          <div className="list-group-item text-center text-muted py-4">
            조건에 맞는 방이 없습니다
          </div>
        )}
      </div>

      {showCreateRoomModal && (
        <CreateRoomModal
          onClose={() => setShowCreateRoomModal(false)}
          onCreate={createRoom}
        />
      )}

      {(showNicknameModal || !nickname) && (
        <NicknameModal
          currentNickname={nickname}
          onSubmit={handleNicknameChange}
          onClose={() => setShowNicknameModal(false)}
          canClose={Boolean(nickname)}
        />
      )}

      {selectedRoom && (
        <PasswordModal
          room={selectedRoom}
          onSubmit={handlePasswordSubmit}
          onClose={handleClosePasswordModal}
        />
      )}
    </div>
  );
}

export default Lobby; 