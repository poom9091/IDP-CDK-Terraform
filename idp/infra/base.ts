import { Construct } from "constructs";
import {  Fn,TerraformStack } from "cdktf";
import { Vpc } from "./.gen/modules/vpc"
import { SecurityGroup} from "./.gen/modules/security_group";
import { ECS } from "./src/ECS"
import { AwsProvider, iam  } from "@cdktf/provider-aws"
import { EcsService} from "@cdktf/provider-aws/lib/ecs"

interface BaseStackConfig {
  cidr: string;
  region: string;
  profile: string; 
  environment: string;
}

export class BaseStack extends TerraformStack {
  public readonly vpc: Vpc;
  constructor(scope: Construct, name: string, config: BaseStackConfig) { 
    super(scope, name);

    new AwsProvider(this,"dev",{
      region: config.region,
      profile: config.profile, 
    })

    this.vpc = new Vpc(this,`${config.environment}-vpc`,{
      "name": `${config.environment}-vpc`,
      "cidr": config.cidr,
      "azs": [`${config.region}a`, `${config.region}b`, `${config.region}c`], 
      publicSubnets: [0, 1, 2].map((netnum: number) => Fn.cidrsubnet(config.cidr, 8, netnum)),
      privateSubnets: [4, 5, 6].map((netnum: number) => Fn.cidrsubnet(config.cidr, 8, netnum)),
      databaseSubnets: [8, 9, 10].map((netnum: number) => Fn.cidrsubnet(config.cidr, 8, netnum)),
    })

    const securityGroups: { [key: string]: SecurityGroup } = {};
    
    securityGroups.public = new SecurityGroup(this,`${config.environment}-sp-public`,{ 
      name: `${config.environment}-sp-public`,
      vpcId: this.vpc.vpcIdOutput,
      ingressWithSelf: [{ rule: "all-all" }],
      egressWithSelf: [{ rule: "all-all" }],
      egressCidrBlocks: ["0.0.0.0/0"],
      egressRules: ["all-all"],
      ingressCidrBlocks: ["0.0.0.0/0"],
      ingressRules: ["https-443-tcp","http-80-tcp"],
    })

    securityGroups.app = new SecurityGroup(this,`${config.environment}-sg-app`,{ 
      name: `${config.environment}-sg-app`,
      vpcId: this.vpc.vpcIdOutput,
      ingressWithSelf: [{ rule: "all-all" }],
      egressWithSelf: [{ rule: "all-all" }],
      egressCidrBlocks: ["0.0.0.0/0"],
      egressRules: ["all-all"],
      ingressCidrBlocks: ["0.0.0.0/0"],
      computedIngressWithSourceSecurityGroupId: [{
        "rule": "all-all",
        "source_security_group_id": securityGroups.public.securityGroupIdOutput
      }]
    })

    securityGroups.data = new SecurityGroup(this,`${config.environment}-sg-data`,{
      name: `${config.environment}-sg-data`,
      vpcId: this.vpc.vpcIdOutput,
      ingressWithSelf: [{ rule: "all-all" }],
      egressWithSelf: [{ rule: "all-all" }],
      egressCidrBlocks: ["0.0.0.0/0"],
      egressRules: ["all-all"],
      ingressCidrBlocks: [config.cidr],
      computedIngressWithSourceSecurityGroupId: [{
        "rule": "all-all",
        "source_security_group_id": securityGroups.app.securityGroupIdOutput
      }]
    })
  
    new iam.IamRole(this,`${config.environment}-ecs-role`,{
      name: `${config.environment}-ecs-role`,
      assumeRolePolicy: `{
        "Version": "2008-10-17",
        "Statement": [
          {
            "Sid": "",
            "Effect": "Allow",
            "Principal": {
              "Service": "ecs-tasks.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
          }
        ]
     }`
    })

   const cluster = new ECS(this,{name: "ecs-demo",environment: "dev"});

   const serviceDemo = cluster.createService({ name: "app-demo",
    image: "gcr.io/cloudrun/hello",
    cpu: 10,
    memory: 512, 
    hostPort: 80, 
    containerPort: 80 
   })
  }
}
