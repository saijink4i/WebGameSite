import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { FaLock, FaUser, FaDice, FaPlayCircle } from 'react-icons/fa';

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

function Lobby({ nickname: initialNickname, setNickname }) {
  const [rooms, setRooms] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showNicknameModal, setShowNicknameModal] = useState(!initialNickname);
  const [nickname, setLocalNickname] = useState(initialNickname);
  const navigate = useNavigate();
  const [filters, setFilters] = useState({});

  useEffect(() => {
    fetchRooms();
    const interval = setInterval(fetchRooms, 3000);
    return () => clearInterval(interval);
  }, []);

  const fetchRooms = async () => {
    try {
      const response = await axios.get('/api/rooms');
      setRooms(response.data);
    } catch (error) {
      console.error('방 목록을 가져오는데 실패했습니다:', error);
    }
  };

  const handleNicknameChange = (newNickname) => {
    sessionStorage.setItem('nickname', newNickname);
    setLocalNickname(newNickname);
    setNickname(newNickname);
    setShowNicknameModal(false);
  };

  const createRoom = async (roomData) => {
    try {
      const response = await axios.post('/api/rooms', {
        creator: nickname,
        title: roomData.title,
        maxPlayers: roomData.maxPlayers,
        password: roomData.password,
        gameType: roomData.gameType
      });
      setShowCreateModal(false);
      navigate(`/room/${response.data.roomId}`);
    } catch (error) {
      console.error('방 생성에 실패했습니다:', error);
    }
  };

  const joinRoom = async (room) => {
    if (room.hasPassword) {
      const password = prompt('비밀번호를 입력하세요:');
      if (!password) return;
      
      try {
        await axios.post(`/api/rooms/${room.id}/check-password`, { password });
      } catch (error) {
        alert('비밀번호가 일치하지 않습니다.');
        return;
      }
    }
    navigate(`/room/${room.id}`);
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
          onClick={() => setShowCreateModal(true)}
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
            <div className="d-flex align-items-center gap-3">
              <div className="d-flex align-items-center gap-2">
                <span className={`badge bg-${GAME_INFO[room.gameType].color}`}>
                  {GAME_INFO[room.gameType].icon}
                  <span className="ms-1">{GAME_INFO[room.gameType].name}</span>
                </span>
                <span className={`badge bg-${STATUS_INFO[room.status].color}`}>
                  {STATUS_INFO[room.status].label}
                </span>
                {room.hasPassword && <FaLock className="text-secondary" />}
                <span className="fw-semibold">{room.title || `${room.players[0]}의 방`}</span>
              </div>
              <span className="badge bg-secondary">
                {room.players.length}/{room.maxPlayers}명
              </span>
            </div>
            <button 
              className="btn btn-outline-primary"
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

      {showCreateModal && (
        <CreateRoomModal
          onClose={() => setShowCreateModal(false)}
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
    </div>
  );
}

export default Lobby; 