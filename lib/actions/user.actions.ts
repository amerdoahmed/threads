"use server"

import { revalidatePath } from "next/cache";
import User from "../models/user.model";
import Community from "../models/community.model";
import { connectToDB } from "../mongoose";
import Thread from "../models/thread.model";
import { FilterQuery, SortOrder } from "mongoose";


interface Params {
    userId : String,
    username : String, 
    name : String, 
    bio : String, 
    image : String, 
    path : String
}

export async function fetchUser(userId: string) {
  
  try {
    connectToDB();

    return await User.findOne({ id: userId }).populate({
      path: "communities",
      model: Community,
    });
  } catch (error: any) {
    console.log(`Failed to fetch user: ${error.message}`);
    // throw new Error(`Failed to fetch user: ${error.message}`);
  }
}

export async function updateUser({
  userId,
  bio,
  name,
  username,
  image,
  path,
}: Params): Promise<void> {
  try {
    connectToDB();

    await User.findOneAndUpdate(
      { id: userId },
      {
        username: username.toLowerCase(),
        name,
        bio,
        image,
        onboarded: true,
      },
      { upsert: true }
    );

    if (path === "/profile/edit") {
      revalidatePath(path); 
    }
  } catch (error: any) { 
    console.log(`Failed to create/update user: ${error.message}`);
    // throw new Error(`Failed to create/update user: ${error.message}`);

  }
}

export async function fetchUserPosts(userId : string){
  try {
    connectToDB();

    // Find all threads authored by the user with the given userId
    const threads = await User.findOne({ id: userId }).populate({
      path: "threads",
      model: Thread,
      populate: [
        {
          path: "community",
          model: Community,
          select: "name id image _id", // Select the "name" and "_id" fields from the "Community" model
        },
        {
          path: "children",
          model: Thread,
          populate: {
            path: "author",
            model: User,
            select: "name image id", // Select the "name" and "_id" fields from the "User" model
          },
        },
      ],
    });
    return threads;
    
  } catch (error:any) {
    console.error("Error fetching user threads:", error);
    throw error;
  }
}

export async function fetchUsers({
  userId,
  searchString = "",
  pageNumber = 1,
  pageSize = 10,
  sortBy = "desc",
}:{
  userId : string;
  searchString ?: string;
  pageNumber?: number;
  pageSize ?: number;
  sortBy ?: SortOrder;
}) {
  try {
    connectToDB();

    // Calculate the number of users to skip based on the page number and page size.
    const skipAmount = (pageNumber - 1) * pageSize;

    // Create a case-insensitive regular expression for the provided search string.
    const regex = new RegExp(searchString, "i");

    const query : FilterQuery<typeof User> = {
      id : {$ne : userId}
    }
    if (searchString.trim() !== '') {
      query.$or = [
        {username : {$regex : regex}},
        {name : {$regex : regex}},
      ]
    }

    const sortOptions = {createdAt : sortBy};

    const usersQuery = User.find(query)
      .sort(sortOptions)
      .skip(skipAmount)
      .limit(pageSize);
    
    const totalUsersCount = await User.countDocuments(query);

    const users = await usersQuery.exec();

    const isNext = totalUsersCount > skipAmount + users.length ; 

    return {users, isNext}

  } catch (error : any) {
    console.error("Error fetching users:", error);
    throw error;
  }
  
}

export async function getActivity(userId:string) {
  try {
    connectToDB();

    // Find all threads created by the user
    const userThreads = await Thread.find({author : userId});

    // Collect all the child thread ids (replies) from the 'children' field of each user thread
    const childThreadIds = userThreads.reduce((acc, userThread)=>{
      return acc.concat(userThread.children)
    },[])

    // Find and return the child threads (replies) excluding the ones created by the same user
    const replies = await Thread.find({
      _id : {$in : childThreadIds},
      author : {$ne : userId} // Exclude threads authored by the same user
    }).populate({
      path: "author",
      model: User,
      select: "name image _id",
    });
    
    return replies;
  } catch (error : any) {
    console.error("Error fetching replies: ", error);
    throw error;
  }
  
}