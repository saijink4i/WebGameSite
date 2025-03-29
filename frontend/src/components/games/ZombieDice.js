import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import './ZombieDice.css';

const ZombieDice = ({ socket, roomId, nickname, gameState }) => {
  // 로그 메시지 관리
  const [logs, setLogs] = useState([]);
  
  // 로그 추가 함수
  const addLog = (message) => {
    console.log(`[ZombieDice] ${message}`); // 터미널에 로그 출력
    setLogs(prevLogs => [...prevLogs, { message, timestamp: new Date().toLocaleTimeString() }]);
  };

  useEffect(() => {
    if (!socket) return;
    
    // 게임 시작 이벤트 리스너
    socket.on('game:start', (data) => {
      addLog(`게임이 시작되었습니다.`);
      addLog(`플레이어 순서: ${data.players.map(p => p.nickname).join(' -> ')}`);
      addLog(`선 플레이어: ${data.currentTurn.nickname}`);
    });
    
    // 주사위 굴리기 결과 이벤트 리스너
    socket.on('game:diceRolled', (data) => {
      addLog(`${data.currentPlayer.nickname}님이 주사위를 굴렸습니다.`);
      addLog(`결과: ${data.rolledDice.map(die => `${die.color} ${die.face}`).join(', ')}`);
    });
    
    // 턴 종료 이벤트 리스너
    socket.on('game:turnEnd', (data) => {
      addLog(`${data.previousPlayer.nickname}님의 턴이 종료되었습니다.`);
      addLog(`${data.currentPlayer.nickname}님의 턴이 시작됩니다.`);
    });
    
    // 게임 종료 이벤트 리스너
    socket.on('game:end', (data) => {
      addLog(`게임이 종료되었습니다.`);
      addLog(`승자: ${data.winner.nickname} (${data.scores[data.winner.nickname]}점)`);
    });

    return () => {
      socket.off('game:start');
      socket.off('game:diceRolled');
      socket.off('game:turnEnd');
      socket.off('game:end');
    };
  }, [socket]);

  // 주사위 굴리기 함수
  const rollDice = () => {
    if (!isCurrentPlayer()) {
      toast.error('당신의 턴이 아닙니다.');
      return;
    }
    addLog('주사위 굴리기 요청을 보냅니다.');
    socket.emit('game:rollDice', { roomId });
  };

  // 턴 종료 함수
  const endTurn = () => {
    if (!isCurrentPlayer()) {
      toast.error('당신의 턴이 아닙니다.');
      return;
    }
    addLog('턴 종료 요청을 보냅니다.');
    socket.emit('game:endTurn', { roomId });
  };

  // 현재 플레이어인지 확인하는 함수
  const isCurrentPlayer = () => {
    return gameState?.currentTurn?.nickname === nickname;
  };

  // 주사위 색상에 따른 스타일 클래스 반환
  const getDiceColorClass = (color) => {
    switch (color.toLowerCase()) {
      case 'red': return 'dice-red';
      case 'yellow': return 'dice-yellow';
      case 'green': return 'dice-green';
      default: return '';
    }
  };

  // 주사위 면에 따른 아이콘 반환
  const getDiceFaceIcon = (face) => {
    switch (face.toLowerCase()) {
      case 'brain': return '🧠';
      case 'shotgun': return '💥';
      case 'footsteps': return '👣';
      default: return '';
    }
  };

  // 초기 게임 상태 설정
  const initialGameState = {
    players: [],
    currentTurn: null,
    dicePool: {
      red: 3,
      yellow: 4,
      green: 6
    },
    rolledDice: [],
    collectedBrains: 0,
    collectedShotguns: 0,
    totalScores: {}
  };

  // 실제 사용할 게임 상태
  const currentGameState = gameState || initialGameState;

  return (
    <div className="zombie-dice-game">
      {/* 플레이어 정보 */}
      <div className="players-info mb-4">
        <h3>플레이어 점수</h3>
        <div className="player-list">
          {currentGameState.players.map(player => (
            <div 
              key={player.nickname}
              className={`player-item ${currentGameState.currentTurn?.nickname === player.nickname ? 'current-turn' : ''}`}
            >
              <span className="player-name">{player.nickname}</span>
              <span className="player-score">
                {currentGameState.totalScores[player.nickname] || 0}점
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 게임 보드 */}
      <div className="game-board mb-4">
        <div className="dice-pool mb-3">
          <h4>주사위 풀</h4>
          <div className="dice-counts">
            <span className="dice-red">빨강: {currentGameState.dicePool.red}</span>
            <span className="dice-yellow">노랑: {currentGameState.dicePool.yellow}</span>
            <span className="dice-green">초록: {currentGameState.dicePool.green}</span>
          </div>
        </div>

        {/* 굴린 주사위 결과 */}
        <div className="rolled-dice mb-3">
          <h4>굴린 주사위</h4>
          <div className="dice-results">
            {currentGameState.rolledDice.map((die, index) => (
              <div 
                key={index} 
                className={`dice ${getDiceColorClass(die.color)}`}
              >
                {getDiceFaceIcon(die.face)}
              </div>
            ))}
            {currentGameState.rolledDice.length === 0 && (
              <p className="text-muted">아직 주사위를 굴리지 않았습니다.</p>
            )}
          </div>
        </div>

        {/* 현재 턴 정보 */}
        <div className="turn-info mb-3">
          <h4>현재 턴 정보</h4>
          <div className="turn-stats">
            <span>모은 뇌: {currentGameState.collectedBrains}</span>
            <span>맞은 총: {currentGameState.collectedShotguns}</span>
          </div>
        </div>

        {/* 게임 액션 버튼 */}
        {isCurrentPlayer() && (
          <div className="game-actions">
            <button 
              className="btn btn-primary me-2"
              onClick={rollDice}
              disabled={currentGameState.collectedShotguns >= 3}
            >
              주사위 굴리기
            </button>
            <button 
              className="btn btn-warning"
              onClick={endTurn}
            >
              턴 종료
            </button>
          </div>
        )}
        {!isCurrentPlayer() && currentGameState.currentTurn && (
          <p className="text-center text-muted">
            {currentGameState.currentTurn.nickname}님의 턴을 기다리는 중입니다...
          </p>
        )}
      </div>

      {/* 게임 로그 */}
      <div className="game-logs">
        <h4>게임 로그</h4>
        <div className="logs-container">
          {logs.map((log, index) => (
            <div key={index} className="log-entry">
              <span className="log-time">{log.timestamp}</span>
              <span className="log-message">{log.message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ZombieDice; 