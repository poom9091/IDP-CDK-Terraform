import { App} from "cdktf";
import BaseStack from "./base";

const app = new App();
// @ts-ignore
const dev_environment = new BaseStack(app, "dev",{
  cidr: "10.0.0.0/16",
  region: "ap-southeast-1",
  profile: "aws-test",
  environment: "dev",
  project: "IDP" 
});

// @ts-ignore
const prod_environment = new BaseStack(app, "prod",{ 
  cidr: "10.1.0.0/16",
  region: "ap-southeast-1",
  profile: "aws-test",
  environment: "prod",
  project: "IDP" 
});
app.synth();
