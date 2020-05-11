import { LoginForm } from "./LoginForm";
import { ContentArea } from "./ContentArea";
import { ServerAccessForm } from "./ServerAccessForm";
import { RegisterForm } from "./RegisterForm";
import { ErrorLog } from "./ErrorLog";
import { PassGen } from "./PassGen";
import { loadedImagesPromise } from "./icons";

document.addEventListener('DOMContentLoaded', async function () {
  await loadedImagesPromise;

  const serverAccess = <HTMLFormElement>document.getElementById('serverAccess');
  const content = <HTMLDivElement>document.getElementById('content');
  const login = <HTMLDivElement>document.getElementById('login');
  const register = <HTMLDivElement>document.getElementById('register');
  const passgenPanel = <HTMLDivElement>document.getElementById('passgen-panel');
  const errorPanel = <HTMLDivElement>document.getElementById('error-panel');

  const serverAccessForm = new ServerAccessForm(serverAccess);

  const errorLog = new ErrorLog(errorPanel);

  const contentArea = new ContentArea(content, errorLog);

  const loginForm = new LoginForm(login, serverAccessForm, contentArea, errorLog);
  const registerForm = new RegisterForm(register, serverAccessForm, errorLog);
  const passgen = new PassGen(passgenPanel, contentArea, errorLog);
  window['contentArea'] = contentArea;
  window['loginForm'] = loginForm;
  window['registerForm'] = registerForm;
  window['passgen'] = passgen;

})
