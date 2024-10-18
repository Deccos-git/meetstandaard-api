import { db } from "./config.js"
import { useState, useEffect} from 'react';
import { collection, query, where, getDocs, orderBy, onSnapshot, limit } from "firebase/firestore"; 

const useFirestore = (collect, key, direction) => {
    const [docs, setDocs] = useState([])

    const col = collection(db, collect);
    const q = query(col, orderBy(key, direction))

    useEffect(() => {

        const unsubscribe = onSnapshot(q, (querySnapshot) => {

            const docArray = [];

            querySnapshot.forEach((doc) => {
                docArray.push({...doc.data(), docid: doc.id});
            });  

            setDocs(docArray)
    
        })
        return () => unsubscribe()

    },[collect, key, direction])

    return docs

}

const useFirestoreOneOrderBy = (collect, key, value, key2, direction) => {
    const [docs, setDocs] = useState([])

    const col = collection(db, collect);
    const q = query(col, where(key, '==', value), orderBy(key2, direction))

    useEffect(() => {

        const unsubscribe = onSnapshot(q, (querySnapshot) => {

            const docArray = [];

            querySnapshot.forEach((doc) => {
                docArray.push({...doc.data(), docid: doc.id});
            });  

            setDocs(docArray)
    
        })
        return () => unsubscribe()

    },[collect, key, value, key2, direction])

    return docs

}

export { 
    useFirestore,
    useFirestoreOneOrderBy
}