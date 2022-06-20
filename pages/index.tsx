import type { NextPage } from 'next'
import Head from 'next/head'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import axios from "axios"
import { useCookies } from "react-cookie"

const Home: NextPage = () => {
  type Item = {
    link : string;
    name: string;
    price_now : number;
    price_avg : number;
    price_new : number; 
    id: number;
    updateSuccess:0|1|-1|2; // 0 -> not done, 1 -> done and success, -1 -> done and no success, 2 -> skipped, because it was in success_inventory_ids
   }
  const [cookie, setCookie] = useCookies(["bl_secrets","secretsReady","success_inventory_ids"])
  const [items,setItems] = useState<Item[]>([])
  const [secretsReady,setSecretsReady]= useState(false)
  const [ranOnce,setRanOnce] = useState(false)
  const [fetchType,setFetchType] = useState<string>("NEW_PARTS")
  const [showSecrets,setShowSecrets] = useState(false)
  const [loading,setLoading] = useState(false)
  const [totalItems,setTotalItems] = useState(0)
  const [amountToUpdate,setAmountToUpdate] = useState<number|"">(500)
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
      if(!cookie.success_inventory_ids){
        setCookie("success_inventory_ids", JSON.stringify({SID:[]}), {
          path: "/",
          maxAge: 36000000,
          sameSite: true,
        })
      }
      if(
        !ranOnce &&
        secret.CONSUMER_KEY!=="" && secret.CONSUMER_SECRET!=="" && secret.TOKEN_SECRET!== "" && secret.TOKEN_VALUE !== ""){
          setRanOnce(true)
          setLoading(true)
          axios.post("/api/bl",{
            link:"https://api.bricklink.com/api/store/v1/colors",
            method:"GET"
          }).then((res)=>{
            setCookie("secretsReady", true, {
              path: "/",
              maxAge: 36000000,
              sameSite: true,
            })
            setSecretsReady(true)
            setLoading(false)
          }).catch( (res) =>{
            setLoading(false)
            setCookie("secretsReady", false, {
              path: "/",
              maxAge: 36000000,
              sameSite: true,
            })
            setSecretsReady(false)
          })
      }
    }
  },[ ranOnce, secret, secretsReady, setCookie])

  const updatePrices = async () => {
    setLoading(true)
    let SID : number[] = cookie.success_inventory_ids.SID 
    for await (const item of items){
      if(item.updateSuccess === -1 || item.updateSuccess === 0 ){
        await axios.post("/api/bl",{
          link:`https://api.bricklink.com/api/store/v1/inventories/${item.id}`,
          method:"PUT",
          body:{
            unit_price:item.price_new
          }
        }).then(async (res)=>{
          let idOfItem = SID.indexOf(item.id)
          if( idOfItem == -1){
            SID = [...SID,item.id]
          }
          setItems([
            ...items.map(_item => {
              if(_item.id === item.id){
                _item.updateSuccess = 1;
              }
              return _item
            })
          ])
        }).catch(async (err)=>{
          setItems([
            ...items.map(_item => {
              if(_item.id === item.id){
                _item.updateSuccess = -1;
              }
              return _item
            })
          ])
        })
      }else{
        let idOfItem = SID.indexOf(item.id)
        if( idOfItem == -1){
          SID = [...SID,item.id]
        }
      }
    }
    await setCookie("success_inventory_ids", {SID}, {
      path: "/",
      maxAge: 36000000,
      sameSite: true,
    })
    setStarted(false)
    setTotalItems(0)
    setLoading(false)
  }

  const fetchitems = () => {
    if(secret && secretsReady){
      setShowSecrets(false)
      setStarted(true)
      setTotalItems(0)
      setLoading(true)
      axios.post("/api/bl",{
        link:"https://api.bricklink.com/api/store/v1/inventories?item_type=PART",
        method:"GET"
      }).then(async (res)=>{
        setLoading(false)
        let parts = res.data.data as Part[]
        let amountOfItemsgotten = 0
        let SID : number[] = cookie.success_inventory_ids.SID 
        if(fetchType==="NEW_PARTS"){
          let parts_filtered = await parts.filter(part=> part.new_or_used==="N").filter(p => {
            let idOfItem = SID.indexOf(p.inventory_id)
            console.log(idOfItem===-1)
            return idOfItem === -1
          })
          console.log(parts_filtered)
          if(parts_filtered.length==0){
            //filter again
            setCookie("success_inventory_ids", {SID:[]}, {
              path: "/",
              maxAge: 36000000,
              sameSite: true,
            })
            parts_filtered = await parts.filter(part=> part.new_or_used==="N")
          }

          let amountOfItemsToProcess = parts_filtered.length > amountToUpdate??1 ? amountToUpdate??1 : parts_filtered.length
          setTotalItems(Number(amountOfItemsToProcess))

          for (const part of parts_filtered){
            if(amountOfItemsgotten >= amountOfItemsToProcess){
              break;
            }
            await axios.post("/api/bl",{
              link:`https://api.bricklink.com/api/store/v1/items/part/${part.item.no}/price?guide_type=sold&new_or_used=${part.new_or_used}`,
              method:"GET"  
            }).then(async (res)=>{
              let newitem : Item =  {
                link: `https://www.bricklink.com/v2/inventory_detail.page?invID=${String(part.inventory_id)}#/pg=1&viewpg=Y`,
                name: `${part.item.name} (${part.item.no}) (${part.color_name})`,
                price_now: Number(part.unit_price),
                price_avg: Number(res.data.data.avg_price),
                price_new: (Math.round((Number(res.data.data.avg_price) + Number.EPSILON) * 100) / 100),
                id:part.inventory_id,
                updateSuccess: Number(part.unit_price)===Number(res.data.data.avg_price)?1:
                Number(res.data.data.avg_price)===0?2:0,
              }
              if(res.data.data.avg_price){
                setItems(items => items.concat(newitem))
              }
            })
            amountOfItemsgotten++
          }
        }else{
          let parts_filtered = await parts.filter(part=> part.new_or_used==="U").filter(p => {
            let idOfItem = SID.indexOf(p.inventory_id)
            console.log(idOfItem===-1)
            return idOfItem === -1
          })
          console.log(parts_filtered)
          if(parts_filtered.length==0){
            //filter again
            setCookie("success_inventory_ids", {SID:[]}, {
              path: "/",
              maxAge: 36000000,
              sameSite: true,
            })
            parts_filtered = await parts.filter(part=> part.new_or_used==="U")
          }

          let amountOfItemsToProcess = parts_filtered.length > amountToUpdate??1 ? amountToUpdate??1 : parts_filtered.length
          setTotalItems(Number(amountOfItemsToProcess))

          for (const part of parts_filtered){
            if(amountOfItemsgotten >= amountOfItemsToProcess){
              break;
            }
            await axios.post("/api/bl",{
              link:`https://api.bricklink.com/api/store/v1/items/part/${part.item.no}/price?guide_type=sold&new_or_used=${part.new_or_used}`,
              method:"GET"  
            }).then(async (res)=>{
              let newitem : Item =  {
                link: `https://www.bricklink.com/v2/inventory_detail.page?invID=${String(part.inventory_id)}#/pg=1&viewpg=Y`,
                name: `${part.item.name} (${part.item.no}) (${part.color_name})`,
                price_now: Number(part.unit_price),
                price_avg: Number(res.data.data.avg_price),
                price_new: (Math.round((Number(res.data.data.avg_price) + Number.EPSILON) * 100) / 100),
                id:part.inventory_id,
                updateSuccess: Number(part.unit_price)===Number(res.data.data.avg_price)?1:
                Number(res.data.data.avg_price)===0?2:0,
              }
              if(res.data.data.avg_price){
                setItems(items => items.concat(newitem))
              }
            })
            amountOfItemsgotten++
          }
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

  const play = (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" className='w-6 h-6 fill-sky-600'>
      <path d="M361 215C375.3 223.8 384 239.3 384 256C384 272.7 375.3 288.2 361 296.1L73.03 472.1C58.21 482 39.66 482.4 24.52 473.9C9.377 465.4 0 449.4 0 432V80C0 62.64 9.377 46.63 24.52 38.13C39.66 29.64 58.21 29.99 73.03 39.04L361 215z"/>
    </svg>
  )
  
  const check = (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" className='w-6 h-6 fill-green-600'><path d="M438.6 105.4C451.1 117.9 451.1 138.1 438.6 150.6L182.6 406.6C170.1 419.1 149.9 419.1 137.4 406.6L9.372 278.6C-3.124 266.1-3.124 245.9 9.372 233.4C21.87 220.9 42.13 220.9 54.63 233.4L159.1 338.7L393.4 105.4C405.9 92.88 426.1 92.88 438.6 105.4H438.6z"/></svg>
  )

  const cog = (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className='w-6 h-6 fill-sky-700 hover:sky-900'>
      <path d="M495.9 166.6C499.2 175.2 496.4 184.9 489.6 191.2L446.3 230.6C447.4 238.9 448 247.4 448 256C448 264.6 447.4 273.1 446.3 281.4L489.6 320.8C496.4 327.1 499.2 336.8 495.9 345.4C491.5 357.3 486.2 368.8 480.2 379.7L475.5 387.8C468.9 398.8 461.5 409.2 453.4 419.1C447.4 426.2 437.7 428.7 428.9 425.9L373.2 408.1C359.8 418.4 344.1 427 329.2 433.6L316.7 490.7C314.7 499.7 307.7 506.1 298.5 508.5C284.7 510.8 270.5 512 255.1 512C241.5 512 227.3 510.8 213.5 508.5C204.3 506.1 197.3 499.7 195.3 490.7L182.8 433.6C167 427 152.2 418.4 138.8 408.1L83.14 425.9C74.3 428.7 64.55 426.2 58.63 419.1C50.52 409.2 43.12 398.8 36.52 387.8L31.84 379.7C25.77 368.8 20.49 357.3 16.06 345.4C12.82 336.8 15.55 327.1 22.41 320.8L65.67 281.4C64.57 273.1 64 264.6 64 256C64 247.4 64.57 238.9 65.67 230.6L22.41 191.2C15.55 184.9 12.82 175.3 16.06 166.6C20.49 154.7 25.78 143.2 31.84 132.3L36.51 124.2C43.12 113.2 50.52 102.8 58.63 92.95C64.55 85.8 74.3 83.32 83.14 86.14L138.8 103.9C152.2 93.56 167 84.96 182.8 78.43L195.3 21.33C197.3 12.25 204.3 5.04 213.5 3.51C227.3 1.201 241.5 0 256 0C270.5 0 284.7 1.201 298.5 3.51C307.7 5.04 314.7 12.25 316.7 21.33L329.2 78.43C344.1 84.96 359.8 93.56 373.2 103.9L428.9 86.14C437.7 83.32 447.4 85.8 453.4 92.95C461.5 102.8 468.9 113.2 475.5 124.2L480.2 132.3C486.2 143.2 491.5 154.7 495.9 166.6V166.6zM256 336C300.2 336 336 300.2 336 255.1C336 211.8 300.2 175.1 256 175.1C211.8 175.1 176 211.8 176 255.1C176 300.2 211.8 336 256 336z"/></svg>
  )
  
  const xmark = (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 512" className='w-6 h-6 fill-red-600' ><path d="M310.6 361.4c12.5 12.5 12.5 32.75 0 45.25C304.4 412.9 296.2 416 288 416s-16.38-3.125-22.62-9.375L160 301.3L54.63 406.6C48.38 412.9 40.19 416 32 416S15.63 412.9 9.375 406.6c-12.5-12.5-12.5-32.75 0-45.25l105.4-105.4L9.375 150.6c-12.5-12.5-12.5-32.75 0-45.25s32.75-12.5 45.25 0L160 210.8l105.4-105.4c12.5-12.5 32.75-12.5 45.25 0s12.5 32.75 0 45.25l-105.4 105.4L310.6 361.4z"/></svg>
  )
  return (
    <div className='bg-sky-200 w-screen h-full min-h-screen p-8'>
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
        <div>
          <span>Zoek </span>
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
        className='p-2 border-2 border-gray-400 rounded-lg m-2 bg-sky-100 ' min={1} max={2480} type={"number"} id=""/>
        </div>
        <div>
          <span> items  van </span>
        </div>
        <select  onChange={(e)=>{
          setFetchType(e.target.value)
        }} className='p-2 border-2 border-gray-400 rounded-lg m-2 bg-sky-100 ' name="" id="">
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
        started && totalItems === items.length && totalItems !== 0 &&
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
      <div className={`w-full bg-sky-100 flex justify-around transition-all h-28 ${secretsReady?"bg-sky-100":"bg-red-100"}`}  style={{display:showSecrets?"flex":"none"}}>
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
      <div className='pb-3 font-bold text-lg px-1'>
        {
          items && totalItems != 0 &&
          (
            <span>{items.length}/{totalItems} items geladen.</span>
          )
        }
      </div>
      <div>
        <table className='bg-sky-50 w-full text-left '>
          <thead>
          <tr>
            <th className='px-4'>Link</th>
            <th className='px-4'>Prijs nu</th>
            <th className='px-4'>Prijs 6 months avg</th>
            <th className='px-4'>Nieuwe updated prijs</th>
          </tr>
          </thead>
         <tbody>  
         {
            items && items.length != 0 && 
            items.map((item,id) => 
            <tr className={`border-2 
            ${item.updateSuccess===1&&' bg-green-500'} 
            ${item.updateSuccess===-1&&' bg-red-500'}
            ${item.updateSuccess===2&&' bg-amber-200'}
            `} key={id}>
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
