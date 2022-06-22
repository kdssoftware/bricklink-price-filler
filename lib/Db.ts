import { Datastore } from '@google-cloud/datastore';
const datastore = new Datastore();

export const addBulkSID = async (customerKey: string, SIDs: number[]) => {
  const taskKey = datastore.key(['SID', customerKey]);
  await datastore.save({
    key: taskKey,
    data: [
      {
        name: "SID",
        value: SIDs,
      }
    ],
  });
}

export const updateBulkSID = async (customerKey: string, SID: number[]) => {
  const transaction = datastore.transaction();
  const taskKey = datastore.key(['SID', customerKey]);
  try {
    await transaction.run();
    transaction.save({
      key: taskKey,
      data: {
        SID,
      },
    });
    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}
export const getSID = async (customerKey: string) => {
  try{
    const transaction = datastore.transaction();
    const taskKey = datastore.key(['SID', customerKey]);
    const [task] = await transaction.get(taskKey);
    return task.SID
  }catch(e){
    await   addBulkSID(customerKey,[]);
    return {
      SID:null
    }
  }
}

