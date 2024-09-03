import Logo from '../../assets/logo-meetstandaard-alt.svg'

const Topbar = () => {
  return (
    <div id='topbar-container'>
        <img id='logo-topbar' src={Logo} alt='logo meetstandaard'/>
        <div id='login-button-container'>
            <p>Login</p>
        </div>
    </div>
  )
}

export default Topbar