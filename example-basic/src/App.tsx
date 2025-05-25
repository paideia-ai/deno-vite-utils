import { useState } from 'react'
import { Button } from 'jsr:@isofucius/deno-shadcn-ui/default/ui/button'

// @deno-vite-import ./globals.css

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className='app'>
      <h1>Vite + Deno + React</h1>
      <div className='card'>
        <Button
          onClick={() => setCount((count) => count + 1)}
          variant='default'
        >
          Count is {count}
        </Button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
    </div>
  )
}

export default App
