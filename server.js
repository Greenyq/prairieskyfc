import express from "express";
const app=express();
const port=process.env.PORT||10000;
app.use(express.static("public"));
app.get("/api/dashboard",(req,res)=>res.json({
  players:30,paid:0,unpaid:0,trials:1,waiting:0,
  groups:{Foundation:0,Performance:0,Girls:0},
  revenue:{collected:0,target:0}
}));
app.listen(port,()=>console.log(`Prairie Sky Manager running on ${port}`));
