import { RouterProvider } from "react-router-dom";
import { router } from "./app/router";
import { SessionGate } from "./app/SessionGate";

function App() {
  return (
    <SessionGate>
      <RouterProvider router={router} />
    </SessionGate>
  );
}

export default App;
