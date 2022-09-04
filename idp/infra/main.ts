import { Fn, App} from "cdktf";
import BaseStack from "./base";
import PetAppStack  from "./contrib/PetApp"; 

const app = new App();
// @ts-ignore
const origin = new BaseStack(app, "dev",{
  cidr: "10.0.0.0/16",
  region: "ap-southeast-1",
  profile: "aws-test",
  environment: "dev",
  project: "IDP" 
});

new PetAppStack(app,"petapp",{
  project: "demo-app",
  profile: "aws-test",
  environment: "dev",
  region: "ap-southeast-1",
  publicSubnets: Fn.tolist(origin.vpc.publicSubnetsOutput),
  vpcId: origin.vpc.vpcIdOutput,
  image: "jenkins", 
  cpu: 1024,
  memory: 2048,
  clusterId: origin.cluster.id,
  containerPort: 80,
  hostPort: 8080,
})

app.synth();
