import { ConsolePage } from './pages/ConsolePage';
import './App.scss';
import HeroMessage from './components/hero/Hero';
import 'materialize-css/dist/css/materialize.min.css';
import 'material-icons/iconfont/material-icons.css';

function App() {
  return (
    <div data-component="App">
      <HeroMessage />
      <ConsolePage />
    </div>
  );
}

export default App;
