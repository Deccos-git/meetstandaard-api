import { useState } from 'react'
import { signInWithEmailAndPassword } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { auth } from "../firebase/config";

const Login = () => {
    // State
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null)

    // Hooks
    const navigate = useNavigate()

    // Email handler
    const emailHandler = (e) => {
        setEmail(e.target.value)
    }

    // Password handler
    const passwordHandler = (e) => {
        setPassword(e.target.value)
    }

    // Login handler
    const loginHandler = (e) => {
        e.preventDefault()
       
        signInWithEmailAndPassword(auth, email, password)
        .then((userCredential) => {
            console.log('User logged in')
            navigate(`/`)
        })
        .catch((error) => {
            const errorCode = error.code;
            const errorMessage = error.message;
            setError(errorMessage)
        });
    }

  return (
    <div>
        <h1>Login</h1>

        <form>
            <label htmlFor="email">Email</label>
            <input type="text" id="email" name="email" onChange={emailHandler}/>

            <label htmlFor="password">Password</label>
            <input type="password" id="password" name="password" onChange={passwordHandler}/>

            <button onClick={loginHandler}>Login</button>
        </form>
        <div className="error-container">
            {error && <p>{error}</p>}
        </div>
    </div>
  )
}

export default Login