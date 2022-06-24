import type { NextPage } from 'next'
import Head from 'next/head'
import { useEffect, useState } from 'react'
import axios from "axios"
import { useCookies } from "react-cookie"

const Home: NextPage = () => {
  enum STATUS {
    ERROR = -1,
    NOT_PROCESSED = 0,
    SUCCESS = 1,
    SKIP_EQUAL = 2,
    SKIP_ZERO = 3,
    SKIP_MANUAL = 4,
    RETRY =5,
  }

  type Item = {
    link : string;
    name: string;
    price_now : number;
    price_avg : number;
    price_new : number; 
    id: number;
    updateSuccess: STATUS; 
   }
  const [cookie, setCookie] = useCookies(["bl_secrets","secretsReady","calls"])
  const [calls,setCalls] = useState<number|null>(null)
  const [items,setItems] = useState<Item[]>([])
  const [secretsReady,setSecretsReady]= useState(false)
  const [ranOnce,setRanOnce] = useState(false)
  const [fetchType,setFetchType] = useState<string>("NEW_PARTS")
  const [SID,setSID] = useState<number[]>([])
  const [showRetry, setRetry] = useState(false)
  const [showSecrets,setShowSecrets] = useState(false)
  const [loading,setLoading] = useState(false)
  const [totalItems,setTotalItems] = useState(0)
  const [amountToUpdate,setAmountToUpdate] = useState<number|"">(50)
  const [started,setStarted] = useState(false)
  const [secret,setSecret] = useState<{
    TOKEN_VALUE? : string;
    TOKEN_SECRET? : string;
    CONSUMER_KEY? : string;
    CONSUMER_SECRET? : string;
  }>()

  if(cookie.bl_secrets && !secret){
    try{
      let obj = cookie.bl_secrets
      setSecret(obj)
    }catch(e){console.trace(e)}
  }



  useEffect(() => {
    if(secret){
      setCookie("bl_secrets", JSON.stringify(secret), {
        path: "/",
        maxAge: 36000000,
        sameSite: true,
      })
      if(
        !ranOnce &&
        secret.CONSUMER_KEY!=="" && secret.CONSUMER_SECRET!=="" && secret.TOKEN_SECRET!== "" && secret.TOKEN_VALUE !== ""){
          setRanOnce(true)
          setLoading(true)
          axios.post("/api/bl",{
            link:"https://api.bricklink.com/api/store/v1/colors",
            method:"GET"
          }).then(async (res)=>{
            await setCalls(calls??0+1)
            await setCookie("secretsReady", true, {
              path: "/",
              maxAge: 36000000,
              sameSite: true,
            })
            await setSecretsReady(true)
              axios.get("/api/sid?customer_key="+secret.CONSUMER_KEY).then((res)=>{
                let SID :number[] = res.data
                setSID(SID);
              })
              await setLoading(false)
          }).catch( async (res) =>{
            await setCalls(calls??0+1)
            await setLoading(false)
            await setCookie("secretsReady", false, {
              path: "/",
              maxAge: 36000000,
              sameSite: true,
            })
            await setSecretsReady(false)
          })
      }
    }
  },[calls, ranOnce, secret, secretsReady, setCookie])

  const updatePrices = async () => {
    if(!calls){return}
    setLoading(true)
    let SIDtemp : number[] = []
    let currentCalls = calls
    let i = 0
    //add all successes and skips + manual skips to SID
    for await (const item of items){
      // only process the not processed ones
      if(item.updateSuccess === STATUS.NOT_PROCESSED || item.updateSuccess === STATUS.RETRY ){
        await axios.post("/api/bl",{
          link:`https://api.bricklink.com/api/store/v1/inventories/${item.id}`,
          method:"PUT",
          body:{
            unit_price:item.price_new.toFixed(2)
          }
        }).then( (res)=>{
          currentCalls++
          setCalls(currentCalls)
          let idNotFound = SID.filter(s=>s===item.id).length===0
          if( idNotFound){
            SID.push(item.id)
          }
          setItems([
            ...items.map(_item => {
              if(_item.id === item.id){
                _item.updateSuccess = STATUS.SUCCESS;
              }
              return _item
            })
          ])
        }).catch( (err)=>{
          currentCalls++
          setCalls(currentCalls)
           setItems([
            ...items.map(_item => {
              if(_item.id === item.id){
                _item.updateSuccess = STATUS.ERROR;
              }
              return _item
            })
          ])
        })
      }else{
        let idNotFound = SID.filter(s=>s===item.id).length===0
        if( idNotFound){
          SIDtemp.push(item.id)
        } 
      }
    }
    if(secret?.CONSUMER_KEY){
      axios.get("/api/sid?customer_key="+secret.CONSUMER_KEY).then((res)=>{
        let latestSID :number[] = res.data
        setSID(latestSID);
        axios.put("/api/sid?customer_key="+secret.CONSUMER_KEY,{SID:[
          ...SID,
          ...SIDtemp
        ]})
      })
    }
    setCalls(currentCalls)
    setRetry(true)
    setLoading(false)
  }


  const retry = async () => {
    await setStarted(false)
    await setTotalItems(0)
    await setLoading(false)
    await setItems(items.filter(item => item.updateSuccess === STATUS.RETRY))
    await setRetry(false)
  }

  const fetchitems = () => {
    if(!calls){return}
    let currentCalls = calls
    if(secret && secretsReady){
      setShowSecrets(false)
      setStarted(true)
      setTotalItems(0)
      setLoading(true)
      axios.post("/api/bl",{
        link:"https://api.bricklink.com/api/store/v1/inventories?item_type=PART",
        method:"GET"
      }).then(async (res)=>{
        currentCalls++
        setCalls(currentCalls)
        setLoading(false)
        let parts = res.data.data as Part[]
        parts = parts.filter(p=>SID.indexOf(p.inventory_id)===-1)
        let amountOfItemsgotten = items.filter(item => item.updateSuccess === STATUS.RETRY).length
        if(fetchType==="NEW_PARTS"){
          let parts_filtered = await parts.filter(part=> part.new_or_used==="N").filter(p => {
            return SID.filter(s=>s===p.inventory_id).length===0
          })
          if(parts_filtered.length==0){
            axios.put("/api/sid?customer_key="+secret.CONSUMER_KEY,{SID:[]})
            setSID([])
          }

          let amountOfItemsToProcess = parts_filtered.length > amountToUpdate??1 ? amountToUpdate??1 : parts_filtered.length
          setTotalItems(Number(amountOfItemsToProcess))
          for await (const part of parts_filtered){
            let partIDs = parts.map(p=>p.inventory_id)
            let partAlreadyInItem = items.filter(_item=>{
              return partIDs.indexOf(_item.id)!==-1
            }).length > 0
            if(partAlreadyInItem ){
              console.log("skip")
              continue;
            }
            if(amountOfItemsgotten >= amountOfItemsToProcess){
              break;
            }
            await axios.post("/api/bl",{
              link:`https://api.bricklink.com/api/store/v1/items/part/${part.item.no}/price?guide_type=sold&new_or_used=${part.new_or_used}&vat=Y&color_id=${part.color_id}`,
              method:"GET"  
            }).then(async (res)=>{
              currentCalls++
              setCalls(currentCalls)
              let price_avg_rounded = (Math.floor((Number(res.data.data.avg_price.toFixed(2)) + Number.EPSILON) * 100) / 100)
              let newitem : Item =  {
                link: `https://www.bricklink.com/v2/inventory_detail.page?invID=${String(part.inventory_id)}#/pg=1&viewpg=Y`,
                name: `${part.item.name} (${part.item.no}) (${part.color_name})`,
                price_now: Number(part.unit_price),
                price_avg: Number(res.data.data.avg_price),
                price_new: price_avg_rounded,
                id:part.inventory_id,
                updateSuccess: (Math.floor((Number(part.unit_price) + Number.EPSILON) * 100) / 100)===Number(price_avg_rounded)?STATUS.SKIP_EQUAL:
                Number(price_avg_rounded)===0?STATUS.SKIP_ZERO:STATUS.NOT_PROCESSED,
              }
              // console.log(newitem.name,"afgerond avg prijs:",price_avg,"gekregen data: ",res.data.data.avg_price)
              if(res.data.data.avg_price){
                setItems(items => items.concat(newitem))
              }
            }).catch(async res=>{
              currentCalls++
              setCalls(currentCalls)
            })
            amountOfItemsgotten++
          }
        }else{
          let parts_filtered = await parts.filter(part=> part.new_or_used==="U").filter(p => {
            return SID.filter(s=>s===p.inventory_id).length===0
          })
          if(parts_filtered.length==0){
            //filter again
            setSID([])
            axios.put("/api/sid?customer_key="+secret.CONSUMER_KEY,{SID:[]})
            parts_filtered = await parts.filter(part=> part.new_or_used==="U")
          }

          let amountOfItemsToProcess = parts_filtered.length > amountToUpdate??1 ? amountToUpdate??1 : parts_filtered.length
          setTotalItems(Number(amountOfItemsToProcess))

          for (const part of parts_filtered){
            if(amountOfItemsgotten >= amountOfItemsToProcess){
              break;
            }
            await axios.post("/api/bl",{
              link:`https://api.bricklink.com/api/store/v1/items/part/${part.item.no}/price?guide_type=sold&new_or_used=${part.new_or_used}&vat=Y&color_id=${part.color_id}`,
              method:"GET"  
            }).then(async (res)=>{
              currentCalls++
              setCalls(currentCalls)
              let price_avg_rounded = (Math.floor((Number(res.data.data.avg_price.toFixed(2)) + Number.EPSILON) * 100) / 100)
              let newitem : Item =  {
                link: `https://www.bricklink.com/v2/inventory_detail.page?invID=${String(part.inventory_id)}#/pg=1&viewpg=Y`,
                name: `${part.item.name} (${part.item.no}) (${part.color_name})`,
                price_now: Number(part.unit_price),
                price_avg: Number(res.data.data.avg_price),
                price_new: price_avg_rounded,
                id:part.inventory_id,
                updateSuccess: (Math.floor((Number(part.unit_price) + Number.EPSILON) * 100) / 100)===Number(price_avg_rounded)?STATUS.SKIP_EQUAL:
                Number(price_avg_rounded)===0?STATUS.SKIP_ZERO:STATUS.NOT_PROCESSED,
              }
              // console.log(newitem.name,"afgerond avg prijs:",price_avg,"prijs avg gekregen: ",res.data.data.avg_price)
              if(res.data.data.avg_price){
                setItems(items => items.concat(newitem))
              }
            }).catch((res)=>{
              currentCalls++
              setCalls(currentCalls)
            })
            amountOfItemsgotten++
          }
          await setCalls(currentCalls)
        } 
      }).catch((err)=>{
        setLoading(false)
      })
    }else{
      setShowSecrets(true)
    }
  }

  const circle_notch = (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className='w-10 h-10 fill-sky-900 animate-spin'>
      <path d="M222.7 32.15C227.7 49.08 218.1 66.9 201.1 71.94C121.8 95.55 64 169.1 64 255.1C64 362 149.1 447.1 256 447.1C362 447.1 448 362 448 255.1C448 169.1 390.2 95.55 310.9 71.94C293.9 66.9 284.3 49.08 289.3 32.15C294.4 15.21 312.2 5.562 329.1 10.6C434.9 42.07 512 139.1 512 255.1C512 397.4 397.4 511.1 256 511.1C114.6 511.1 0 397.4 0 255.1C0 139.1 77.15 42.07 182.9 10.6C199.8 5.562 217.6 15.21 222.7 32.15V32.15z"/>
    </svg>
  )

  const search =  (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className='w-6 h-6 fill-sky-600'>
      <path d="M500.3 443.7l-119.7-119.7c27.22-40.41 40.65-90.9 33.46-144.7C401.8 87.79 326.8 13.32 235.2 1.723C99.01-15.51-15.51 99.01 1.724 235.2c11.6 91.64 86.08 166.7 177.6 178.9c53.8 7.189 104.3-6.236 144.7-33.46l119.7 119.7c15.62 15.62 40.95 15.62 56.57 0C515.9 484.7 515.9 459.3 500.3 443.7zM79.1 208c0-70.58 57.42-128 128-128s128 57.42 128 128c0 70.58-57.42 128-128 128S79.1 278.6 79.1 208z"/>
    </svg>
  )

  const globe = (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className='w-4 h-4 fill-white' >
      <path d="M352 256C352 278.2 350.8 299.6 348.7 320H163.3C161.2 299.6 159.1 278.2 159.1 256C159.1 233.8 161.2 212.4 163.3 192H348.7C350.8 212.4 352 233.8 352 256zM503.9 192C509.2 212.5 512 233.9 512 256C512 278.1 509.2 299.5 503.9 320H380.8C382.9 299.4 384 277.1 384 256C384 234 382.9 212.6 380.8 192H503.9zM493.4 160H376.7C366.7 96.14 346.9 42.62 321.4 8.442C399.8 29.09 463.4 85.94 493.4 160zM344.3 160H167.7C173.8 123.6 183.2 91.38 194.7 65.35C205.2 41.74 216.9 24.61 228.2 13.81C239.4 3.178 248.7 0 256 0C263.3 0 272.6 3.178 283.8 13.81C295.1 24.61 306.8 41.74 317.3 65.35C328.8 91.38 338.2 123.6 344.3 160H344.3zM18.61 160C48.59 85.94 112.2 29.09 190.6 8.442C165.1 42.62 145.3 96.14 135.3 160H18.61zM131.2 192C129.1 212.6 127.1 234 127.1 256C127.1 277.1 129.1 299.4 131.2 320H8.065C2.8 299.5 0 278.1 0 256C0 233.9 2.8 212.5 8.065 192H131.2zM194.7 446.6C183.2 420.6 173.8 388.4 167.7 352H344.3C338.2 388.4 328.8 420.6 317.3 446.6C306.8 470.3 295.1 487.4 283.8 498.2C272.6 508.8 263.3 512 255.1 512C248.7 512 239.4 508.8 228.2 498.2C216.9 487.4 205.2 470.3 194.7 446.6H194.7zM190.6 503.6C112.2 482.9 48.59 426.1 18.61 352H135.3C145.3 415.9 165.1 469.4 190.6 503.6V503.6zM321.4 503.6C346.9 469.4 366.7 415.9 376.7 352H493.4C463.4 426.1 399.8 482.9 321.4 503.6V503.6z"/>
      </svg>
  )
  const play = (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" className='w-6 h-6 fill-sky-600'>
      <path d="M361 215C375.3 223.8 384 239.3 384 256C384 272.7 375.3 288.2 361 296.1L73.03 472.1C58.21 482 39.66 482.4 24.52 473.9C9.377 465.4 0 449.4 0 432V80C0 62.64 9.377 46.63 24.52 38.13C39.66 29.64 58.21 29.99 73.03 39.04L361 215z"/>
    </svg>
  )
  
  const check = (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" className='w-6 h-6 fill-green-600'><path d="M438.6 105.4C451.1 117.9 451.1 138.1 438.6 150.6L182.6 406.6C170.1 419.1 149.9 419.1 137.4 406.6L9.372 278.6C-3.124 266.1-3.124 245.9 9.372 233.4C21.87 220.9 42.13 220.9 54.63 233.4L159.1 338.7L393.4 105.4C405.9 92.88 426.1 92.88 438.6 105.4H438.6z"/></svg>
  )
  const checkWhite = (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" className='w-6 h-6 fill-white'><path d="M438.6 105.4C451.1 117.9 451.1 138.1 438.6 150.6L182.6 406.6C170.1 419.1 149.9 419.1 137.4 406.6L9.372 278.6C-3.124 266.1-3.124 245.9 9.372 233.4C21.87 220.9 42.13 220.9 54.63 233.4L159.1 338.7L393.4 105.4C405.9 92.88 426.1 92.88 438.6 105.4H438.6z"/></svg>
  )

  const cog = (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className='w-6 h-6 fill-sky-700 hover:sky-900'>
      <path d="M495.9 166.6C499.2 175.2 496.4 184.9 489.6 191.2L446.3 230.6C447.4 238.9 448 247.4 448 256C448 264.6 447.4 273.1 446.3 281.4L489.6 320.8C496.4 327.1 499.2 336.8 495.9 345.4C491.5 357.3 486.2 368.8 480.2 379.7L475.5 387.8C468.9 398.8 461.5 409.2 453.4 419.1C447.4 426.2 437.7 428.7 428.9 425.9L373.2 408.1C359.8 418.4 344.1 427 329.2 433.6L316.7 490.7C314.7 499.7 307.7 506.1 298.5 508.5C284.7 510.8 270.5 512 255.1 512C241.5 512 227.3 510.8 213.5 508.5C204.3 506.1 197.3 499.7 195.3 490.7L182.8 433.6C167 427 152.2 418.4 138.8 408.1L83.14 425.9C74.3 428.7 64.55 426.2 58.63 419.1C50.52 409.2 43.12 398.8 36.52 387.8L31.84 379.7C25.77 368.8 20.49 357.3 16.06 345.4C12.82 336.8 15.55 327.1 22.41 320.8L65.67 281.4C64.57 273.1 64 264.6 64 256C64 247.4 64.57 238.9 65.67 230.6L22.41 191.2C15.55 184.9 12.82 175.3 16.06 166.6C20.49 154.7 25.78 143.2 31.84 132.3L36.51 124.2C43.12 113.2 50.52 102.8 58.63 92.95C64.55 85.8 74.3 83.32 83.14 86.14L138.8 103.9C152.2 93.56 167 84.96 182.8 78.43L195.3 21.33C197.3 12.25 204.3 5.04 213.5 3.51C227.3 1.201 241.5 0 256 0C270.5 0 284.7 1.201 298.5 3.51C307.7 5.04 314.7 12.25 316.7 21.33L329.2 78.43C344.1 84.96 359.8 93.56 373.2 103.9L428.9 86.14C437.7 83.32 447.4 85.8 453.4 92.95C461.5 102.8 468.9 113.2 475.5 124.2L480.2 132.3C486.2 143.2 491.5 154.7 495.9 166.6V166.6zM256 336C300.2 336 336 300.2 336 255.1C336 211.8 300.2 175.1 256 175.1C211.8 175.1 176 211.8 176 255.1C176 300.2 211.8 336 256 336z"/></svg>
  )
  
  const xmark = (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 512" className='w-6 h-6 fill-white' ><path d="M310.6 361.4c12.5 12.5 12.5 32.75 0 45.25C304.4 412.9 296.2 416 288 416s-16.38-3.125-22.62-9.375L160 301.3L54.63 406.6C48.38 412.9 40.19 416 32 416S15.63 412.9 9.375 406.6c-12.5-12.5-12.5-32.75 0-45.25l105.4-105.4L9.375 150.6c-12.5-12.5-12.5-32.75 0-45.25s32.75-12.5 45.25 0L160 210.8l105.4-105.4c12.5-12.5 32.75-12.5 45.25 0s12.5 32.75 0 45.25l-105.4 105.4L310.6 361.4z"/></svg>
  )
  const skip = (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className='w-6 h-6 fill-white'>
      <path d="M52.51 440.6l171.5-142.9V214.3L52.51 71.41C31.88 54.28 0 68.66 0 96.03v319.9C0 443.3 31.88 457.7 52.51 440.6zM308.5 440.6l192-159.1c15.25-12.87 15.25-36.37 0-49.24l-192-159.1c-20.63-17.12-52.51-2.749-52.51 24.62v319.9C256 443.3 287.9 457.7 308.5 440.6z"/>
    </svg>
  )

  const equal = (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" className='w-6 h-6 fill-white'>
      <path d="M48 192h352c17.69 0 32-14.32 32-32s-14.31-31.1-32-31.1h-352c-17.69 0-32 14.31-32 31.1S30.31 192 48 192zM400 320h-352c-17.69 0-32 14.31-32 31.1s14.31 32 32 32h352c17.69 0 32-14.32 32-32S417.7 320 400 320z"/>
    </svg>
  )

  const error = (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className='w-6 h-6 fill-white' >
      <path d="M506.3 417l-213.3-364c-16.33-28-57.54-28-73.98 0l-213.2 364C-10.59 444.9 9.849 480 42.74 480h426.6C502.1 480 522.6 445 506.3 417zM232 168c0-13.25 10.75-24 24-24S280 154.8 280 168v128c0 13.25-10.75 24-23.1 24S232 309.3 232 296V168zM256 416c-17.36 0-31.44-14.08-31.44-31.44c0-17.36 14.07-31.44 31.44-31.44s31.44 14.08 31.44 31.44C287.4 401.9 273.4 416 256 416z"/>
    </svg>
  )

  const hourglass_empty = (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" className='w-6 h-6 fill-white'  >
      <path d="M0 32C0 14.33 14.33 0 32 0H352C369.7 0 384 14.33 384 32C384 49.67 369.7 64 352 64V74.98C352 117.4 335.1 158.1 305.1 188.1L237.3 256L305.1 323.9C335.1 353.9 352 394.6 352 437V448C369.7 448 384 462.3 384 480C384 497.7 369.7 512 352 512H32C14.33 512 0 497.7 0 480C0 462.3 14.33 448 32 448V437C32 394.6 48.86 353.9 78.86 323.9L146.7 256L78.86 188.1C48.86 158.1 32 117.4 32 74.98V64C14.33 64 0 49.67 0 32zM96 64V74.98C96 100.4 106.1 124.9 124.1 142.9L192 210.7L259.9 142.9C277.9 124.9 288 100.4 288 74.98V64H96zM96 448H288V437C288 411.6 277.9 387.1 259.9 369.1L192 301.3L124.1 369.1C106.1 387.1 96 411.6 96 437V448z"/>
    </svg>
  )

  const zero = (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 512" className='w-6 h-6 fill-white'>
      <path d="M160 32.01c-88.37 0-160 71.63-160 160v127.1c0 88.37 71.63 160 160 160s160-71.63 160-160V192C320 103.6 248.4 32.01 160 32.01zM256 320c0 52.93-43.06 96-96 96c-52.93 0-96-43.07-96-96V192c0-52.94 43.07-96 96-96c52.94 0 96 43.06 96 96V320z"/>
    </svg>
  )

  const refresh = (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className='w-6 h-6 fill-sky-600'>
      <path d="M464 16c-17.67 0-32 14.31-32 32v74.09C392.1 66.52 327.4 32 256 32C161.5 32 78.59 92.34 49.58 182.2c-5.438 16.81 3.797 34.88 20.61 40.28c16.89 5.5 34.88-3.812 40.3-20.59C130.9 138.5 189.4 96 256 96c50.5 0 96.26 24.55 124.4 64H336c-17.67 0-32 14.31-32 32s14.33 32 32 32h128c17.67 0 32-14.31 32-32V48C496 30.31 481.7 16 464 16zM441.8 289.6c-16.92-5.438-34.88 3.812-40.3 20.59C381.1 373.5 322.6 416 256 416c-50.5 0-96.25-24.55-124.4-64H176c17.67 0 32-14.31 32-32s-14.33-32-32-32h-128c-17.67 0-32 14.31-32 32v144c0 17.69 14.33 32 32 32s32-14.31 32-32v-74.09C119.9 445.5 184.6 480 255.1 480c94.45 0 177.4-60.34 206.4-150.2C467.9 313 458.6 294.1 441.8 289.6z"/>\
    </svg>
  )
  const refreshWhite = (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className='w-6 h-6 fill-white'>
      <path d="M464 16c-17.67 0-32 14.31-32 32v74.09C392.1 66.52 327.4 32 256 32C161.5 32 78.59 92.34 49.58 182.2c-5.438 16.81 3.797 34.88 20.61 40.28c16.89 5.5 34.88-3.812 40.3-20.59C130.9 138.5 189.4 96 256 96c50.5 0 96.26 24.55 124.4 64H336c-17.67 0-32 14.31-32 32s14.33 32 32 32h128c17.67 0 32-14.31 32-32V48C496 30.31 481.7 16 464 16zM441.8 289.6c-16.92-5.438-34.88 3.812-40.3 20.59C381.1 373.5 322.6 416 256 416c-50.5 0-96.25-24.55-124.4-64H176c17.67 0 32-14.31 32-32s-14.33-32-32-32h-128c-17.67 0-32 14.31-32 32v144c0 17.69 14.33 32 32 32s32-14.31 32-32v-74.09C119.9 445.5 184.6 480 255.1 480c94.45 0 177.4-60.34 206.4-150.2C467.9 313 458.6 294.1 441.8 289.6z"/>\
    </svg>
  )

  const getSVGbasedOnUpdateSuccess = (updateSuccess : STATUS,onClickCallBack? : Function) => {
    let svg = <></>
    let clickable = false
    let className = ""
    switch(updateSuccess){
      case STATUS.ERROR :
        svg = error
        className = "bg-red-600 hover:bg-sky-600"
        clickable = true
        break;
      case STATUS.NOT_PROCESSED : 
        svg = hourglass_empty
        className = "bg-sky-600 hover:bg-yellow-600"
        clickable = true
        break;
      case STATUS.SKIP_EQUAL:
        svg = equal
        className = "bg-yellow-600"
        break;
      case STATUS.SKIP_ZERO:
        svg = zero
        className = "bg-yellow-600"
        break;
      case STATUS.SKIP_MANUAL:
        svg = skip
        className = "bg-yellow-600 hover:bg-sky-600"
        clickable = true
        break;
      case STATUS.SUCCESS:
        svg = checkWhite
        className = "bg-green-600"
        break;
      case STATUS.RETRY :
        svg = refreshWhite
        className = "bg-sky-600 hover:bg-red-600"
        clickable = true
        break;
    }
    return <button onClick={()=>{
      if(clickable && onClickCallBack){
        onClickCallBack()
      }
    }} className={"p-2 border-2 "+(clickable?"hover:scale-105 transition-all cursor-pointer":"")+" rounded-xl "+className}>
      {svg}
    </button>
  }

  return (
    <div className='bg-sky-200 w-screen h-full min-h-screen p-8'>
      <Head>
        <link rel="shortcut icon" href="/logo.png" type="image/x-icon" />
      </Head>
      <div className='relative w-full mb-4 h-20 bg-sky-100 flex justify-center items-center text-sky-900 font-bold'>
      {
        loading &&
          <button onClick={()=>{
              setShowSecrets(!showSecrets)
          }} className={`absolute left-5 p-2 rounded-lg m-2 transition`}>
                {
                  circle_notch
                }
          </button>
        }
        <div className='absolute left-60 py-1 flex flex-col hover:scale-105 cursor-pointer'>
        <a href="https://www.fyrebrick.nl/en/">
            <div className='flex justify-center'>
              <img src="/logo.png" alt="" className='w-28' />
            </div>
            <div className='text-red-800'>Developed by Fyrebrick</div>
        </a>
        </div>

        <div>
          <span>Search </span>
        </div>

        <div>
        <input onChange={(e)=>{
          let a = Number(e.target.value)
          if (e.target.value === ""){
            setAmountToUpdate("")
          }else if ( a > 2498 ){
            setAmountToUpdate(2498)
          }else if (a < 0){
            setAmountToUpdate(1)
          }else{
            setAmountToUpdate(a)
          }
        }} 
        value={amountToUpdate}
        className='p-2 border-2 border-gray-400 rounded-lg m-2 bg-sky-100 ' min={1} max={2480} type={"number"} id="" disabled={started}/>
        </div>
        <div>
          <span> items  from </span>
        </div>
        <select  onChange={(e)=>{
          setFetchType(e.target.value)
        }} className='p-2 border-2 border-gray-400 rounded-lg m-2 bg-sky-100 ' name="" id="" disabled={started}>
          <option value="NEW_PARTS">New Parts</option>
          <option value="OLD_PARTS">Old Parts</option>
        </select>
      {
        !started &&
          <button onClick={()=>{
            fetchitems()
          }} className='p-2 border-2 border-gray-400 rounded-lg m-2 hover:bg-sky-100 hover:scale-110 transition'>
                {search}
          </button>
      }
      {
        showRetry &&
        <button onClick={()=>{
          retry()
        }} className='p-2 border-2 border-gray-400 rounded-lg m-2 hover:bg-sky-100 hover:scale-110 transition'>
              {refresh}
        </button>
      }
      {
        started && totalItems === items.length && totalItems !== 0 && !showRetry && 
          <button onClick={()=>{
            updatePrices()
          }} className='p-2 border-2 border-gray-400 rounded-lg m-2 hover:bg-sky-100 hover:scale-110 transition'>
                {play}
          </button>
      }
      <button onClick={()=>{
          setShowSecrets(!showSecrets)
      }} className={`absolute right-5 p-2 border-2 border-gray-400 rounded-lg m-2 hover:bg-sky-100 hover:scale-110 transition ${secretsReady?"":"border-red-700 bg-red-100 animate-pulse"}`}>
            {
              secretsReady ?
              check : xmark
            }
      </button>
      </div>
      <div className={`w-full mb-3 bg-sky-100 flex justify-around transition-all h-28 ${secretsReady?"bg-sky-100":"bg-red-100"}`}  style={{display:showSecrets?"flex":"none"}}>
        <label htmlFor="ConsumerKey" className='font-lg mx-4 w-full flex flex-col justify-center items-center'>
          <span className='pb-2 font-bold text-lg'>Consumer key</span>
          <input 
          onChange={(e)=>{
            if(JSON.stringify(e.target.value)!==JSON.stringify(secret)){
              setRanOnce(false)
            }
            setSecret({
              ...secret,
              CONSUMER_KEY:e.target.value
            })
          }}
          value={secret?.CONSUMER_KEY??""}
          className={`w-full px-2 py-1 rounded-lg  bg-sky-50 ${secret?.CONSUMER_KEY?.trim()===""?"border-red-700 focus-visible:border-red-700 ":"border-gray-200"}`} 
          id="ConsumerKey" type="text" />
        </label>
        <label htmlFor="ConsumerSecret" className='font-lg mx-4 w-full flex flex-col justify-center items-center'>
          <span className='pb-2 font-bold text-lg'>Consumer secret</span>
          <input
           onChange={(e)=>{
            if(JSON.stringify(e.target.value)!==JSON.stringify(secret)){
              setRanOnce(false)
            }
            setSecret({
              ...secret,
              CONSUMER_SECRET:e.target.value
            })
          }}
          value={secret?.CONSUMER_SECRET??""}
          className={`w-full px-2 py-1 rounded-lg border-2  bg-sky-50 ${secret?.CONSUMER_SECRET?.trim()===""?"border-red-700 focus-visible:border-red-700":"border-gray-200"}`}
           id="ConsumerSecret" type="text" />
        </label>
        <label htmlFor="TokenValue" className='font-lg  mx-4 w-full flex flex-col justify-center items-center'>
          <span className='pb-2 font-bold text-lg'>Token value</span>
          <input
            onChange={(e)=>{
              if(JSON.stringify(e.target.value)!==JSON.stringify(secret)){
                setRanOnce(false)
              }
            setSecret({
              ...secret,
              TOKEN_VALUE:e.target.value
            })
          }}
          value={secret?.TOKEN_VALUE??""}
          className={`w-full px-2 py-1 rounded-lg  border-2  bg-sky-50 ${secret?.TOKEN_VALUE===""?"border-red-700 focus-visible:border-red-700":"border-gray-200"}`} 
          id="TokenValue" type="text" />
        </label>
        <label htmlFor="TokenSecret" className='font-lg mx-4 w-full flex flex-col justify-center items-center'>
          <span className='pb-2 font-bold text-lg'>Token secret</span>
        <input 
          onChange={(e)=>{
            if(JSON.stringify(e.target.value)!==JSON.stringify(secret)){
              setRanOnce(false)
            }
            setSecret({
              ...secret,
              TOKEN_SECRET:e.target.value
            })
          }}
          value={secret?.TOKEN_SECRET??""}
          className={`w-full px-2 py-1 rounded-lg border-2  bg-sky-50 ${secret?.TOKEN_SECRET?.trim()===""?"border-red-700 focus-visible:border-red-700 ":"border-gray-200"}`} 
          id="TokenSecret" type="text" />
        </label>
      </div>
      <div className='w-full flex flex-row justify-between pb-3'>
      <div className='relative font-bold text-lg px-1'>
        {
          items && totalItems != 0 ?
          (
            <span>{items.length}/{totalItems} items loaded.</span>
          ):(<span>  </span>)
        }
      </div>
      <div 
        onClick={()=>{
          setCalls(0)
        }}
        className='text-white bg-sky-400 w-24 h-8 rounded-sm hover:bg-red-800 cursor-pointer transition-all flex justify-around items-center'>
        {calls??0} {globe}
      </div>
      </div>
      <div>
        <table className='bg-sky-50 w-full text-left '>
          <thead>
          <tr>
            <th>{" "}</th>
            <th className='px-4'>Link</th>
            <th className='px-4'>Price nu</th>
            <th className='px-4'>Price 6 months avg</th>
            <th className='px-4'>New updated price</th>
          </tr>
          </thead>
         <tbody>  
         {
            items && items.length != 0 && 
            items.map((item,id) => 
            <tr className={`border-2 
            ${item.updateSuccess===STATUS.SUCCESS&&' bg-green-500'} 
            ${item.updateSuccess===STATUS.ERROR&&' bg-red-500'}
            ${
              (
              item.updateSuccess===STATUS.SKIP_EQUAL ||
              item.updateSuccess===STATUS.SKIP_ZERO ||
              item.updateSuccess===STATUS.SKIP_MANUAL 
              ) &&' bg-amber-200'}
            `} key={id}>
              <td className='pl-3 py-0.5'>
                {getSVGbasedOnUpdateSuccess(item.updateSuccess,()=>{
                  console.log("clickin' ",item.id," ",item.updateSuccess)
                  if(item.updateSuccess === STATUS.NOT_PROCESSED){
                    setItems(items.map(_item=>{
                      if(_item.id === item.id){
                        _item.updateSuccess = STATUS.SKIP_MANUAL
                      }
                      return _item
                    }))
                  }else if(item.updateSuccess=== STATUS.SKIP_MANUAL){
                    setItems(items.map(_item=>{
                      if(_item.id === item.id){
                        _item.updateSuccess = STATUS.NOT_PROCESSED
                      }
                      return _item
                    }))
                  }else if(item.updateSuccess=== STATUS.ERROR){
                    setItems(items.map(_item=>{
                      if(_item.id === item.id){
                        _item.updateSuccess = STATUS.RETRY
                      }
                      return _item
                    }))
                  }else  if(item.updateSuccess=== STATUS.RETRY){
                    setItems(items.map(_item=>{
                      if(_item.id === item.id){
                        _item.updateSuccess = STATUS.ERROR
                      }
                      return _item
                    }))
                  }
                })}
              </td>
              <td className='px-4 border-x-2 py-0.5 text-sky-800 underline hover:text-sky-600'> <a target="_blank" href={item.link} rel="noreferrer">{item.name}</a></td>
              <td className='px-4 border-x-2 py-0.5'>{item.price_now}</td>
              <td className='px-4 border-x-2 py-0.5'>{item.price_avg}</td>
              <td className='px-4 border-x-2 py-0.5'>{item.price_new}</td>
            </tr>)
          }
         </tbody>
        </table>
      </div>
    </div>
  )
}

export default Home




export interface Part {
  inventory_id:   number;
  item:           Item;
  color_id:       number;
  color_name:     string;
  quantity:       number;
  new_or_used:    string;
  unit_price:     string;
  bind_id:        number;
  description:    string;
  remarks:        string;
  bulk:           number;
  is_retain:      boolean;
  is_stock_room:  boolean;
  date_created:   Date;
  my_cost:        string;
  sale_rate:      number;
  tier_quantity1: number;
  tier_price1:    string;
  tier_quantity2: number;
  tier_price2:    string;
  tier_quantity3: number;
  tier_price3:    string;
  my_weight:      string;
}

export interface Item {
  no:          string;
  name:        string;
  type:        string;
  category_id: number;
}
