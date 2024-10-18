import Modal from 'react-modal';

const ReactModal = ({ open, setOpen, title, text }) => {

    Modal.setAppElement('#root');

    const customStyles = {
        content: {
            top: '50%',
            left: '50%',
            right: 'auto',
            bottom: 'auto',
            marginRight: '-50%',
            transform: 'translate(-50%, -50%)',
        },
    };

    const closeModal = () => {
        setOpen(false);  
    }

    return (
        <Modal
            isOpen={open}  
            onRequestClose={closeModal}
            style={customStyles}
            contentLabel="Confirmation Modal"
        >
            <h2>{title}</h2>
            <p>{text}</p>
            <div>
                <button onClick={closeModal}>Close</button>
            </div>
        </Modal>
    )
}

export default ReactModal;
