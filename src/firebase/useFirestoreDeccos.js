import { dbDeccos } from "./configDeccos.js"
import { useState, useEffect} from 'react';
import { collection, query, where, getDocs, orderBy, onSnapshot, limit } from "firebase/firestore"; 

const useFirestoreOrderBy = (collect, key2, direction) => {
    const [docs, setDocs] = useState([])

    const col = collection(dbDeccos, collect);
    const q = query(col, orderBy(key2, direction))

    useEffect(() => {

        const unsubscribe = onSnapshot(q, (querySnapshot) => {

            const docArray = [];

            querySnapshot.forEach((doc) => {
                docArray.push({...doc.data(), docid: doc.id});
            });  

            setDocs(docArray)
    
        })
        return () => unsubscribe()

    },[collect, key2, direction])

    return docs

}

export { 
    useFirestoreOrderBy
}