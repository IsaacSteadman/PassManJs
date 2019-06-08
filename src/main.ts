import { LoginForm } from "./LoginForm";
import { ContentArea } from "./ContentArea";
import { ServerAccessForm } from "./ServerAccessForm";
import { RegisterForm } from "./RegisterForm";

document.addEventListener('DOMContentLoaded', function () {


  const serverAccess = <HTMLFormElement>document.getElementById('serverAccess');
  const content = <HTMLDivElement>document.getElementById('content');
  const login = <HTMLDivElement>document.getElementById('login');
  const register = <HTMLDivElement>document.getElementById('register');

  const serverAccessForm = new ServerAccessForm(serverAccess);

  const contentArea = new ContentArea(content);

  const loginForm = new LoginForm(login, serverAccessForm, contentArea);
  const registerForm = new RegisterForm(register, serverAccessForm);

})
