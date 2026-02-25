import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import Pachinko from './Patinko-home'; // さっき作ったコンポーネント
import { SlotMachine } from './components/SlotMachine';

function App() {
  const [count, setCount] = useState(0)
  // パチンコ画面を表示するかどうかのステート
  const [isGameStarted, setIsGameStarted] = useState(false)

  // パチンコ画面がONなら、Pachinkoコンポーネントだけを表示して終了
  if (isGameStarted) {
    return (
      <div className="game-wrapper">
        <button 
          onClick={() => setIsGameStarted(false)} 
          style={{ position: 'absolute', top: 20, left: 20, zIndex: 100 }}
        >
          メニューに戻る
        </button>
        <Pachinko />
      </div>
    )
  }

  // 通常のメニュー画面
  return (
    <>
      <div>
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      
      {/* <a>タグをボタンのように扱い、クリックでステートを切り替える */}
      <div style={{ margin: '20px' }}>
        <button
          onClick={() => setIsGameStarted(true)}
          style={{ fontSize: '1.5rem', color: '#646cff', cursor: 'pointer' }}
        >
          ここからパチンコを始める
        </button>
      </div>

      {/* SlotMachine 動作確認 */}
      <div style={{ margin: '40px auto', display: 'flex', justifyContent: 'center' }}>
        <SlotMachine onResult={(result, isWin) => console.log('SlotResult:', result, isWin)} />
      </div>

      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </>
  )
}

export default App