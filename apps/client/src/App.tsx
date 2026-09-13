import { RouterProvider } from "react-router-dom";
import { router } from "./app/router";
import { SessionGate } from "./app/SessionGate";
import { UpdateNotifier } from "./app/layout/UpdateNotifier";

function App() {
  return (
    <SessionGate>
      <UpdateNotifier />
      <RouterProvider router={router} />
    </SessionGate>
  );
}

export default App;
