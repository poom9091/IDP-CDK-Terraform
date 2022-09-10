import { Construct } from "constructs";
import {  Fn,TerraformStack } from "cdktf";
import { Vpc } from "./.gen/modules/vpc"
import { SecurityGroup} from "./.gen/modules/security_group";
import { ECS } from "./src/ECS"
import { AwsProvider, dynamodb, ecs, ssm} from "@cdktf/provider-aws" 
  
interface BaseStackConfig {
  cidr: string;
  region: string;
  profile: string; 
  environment: string;
  project: string
}

export default class BaseStack extends TerraformStack {
  public readonly vpc: Vpc;
  public securityGroups:{ [key: string]: SecurityGroup } = {};  
  public cluster: ecs.EcsCluster;
  constructor(scope: Construct, name: string, config: BaseStackConfig) { 
    super(scope, name);

    new AwsProvider(this,"dev",{
      region: config.region,
      profile: config.profile, 
    })

    this.vpc = new Vpc(this,`${config.environment}-vpc`,{
      "name": `${config.environment}-${config.profile}.vpc`,
      "cidr": config.cidr,
      "azs": [`${config.region}a`, `${config.region}b`, `${config.region}c`], 
      "publicSubnets": [0, 1, 2].map((netnum: number) => Fn.cidrsubnet(config.cidr, 8, netnum)),
      "privateSubnets": [4, 5, 6].map((netnum: number) => Fn.cidrsubnet(config.cidr, 8, netnum)),
      "databaseSubnets": [8, 9, 10].map((netnum: number) => Fn.cidrsubnet(config.cidr, 8, netnum)),
    })

    new ssm.SsmParameter(this,`region`,{
      name: `/${config.environment}/aws_default_region`,
      type: "String",
      value: config.region
    }) 
    
    
    this.securityGroups.public = new SecurityGroup(this,`${config.environment}-sp-public`,{ 
      name: `${config.environment}-sp-public`,
      vpcId: this.vpc.vpcIdOutput,
      // ingressWithSelf: [{ rule: "all-all" }],
      // egressWithSelf: [{ rule: "all-all" }],
      // egressCidrBlocks: ["0.0.0.0/0"],
      egressRules: ["all-all"],
      ingressCidrBlocks: ["0.0.0.0/0"],
      ingressRules: ["https-443-tcp","http-80-tcp"],
    })

    this.securityGroups.app = new SecurityGroup(this,`${config.environment}-sg-app`,{ 
      name: `${config.environment}-sg-app`,
      vpcId: this.vpc.vpcIdOutput,
      egressCidrBlocks: ["0.0.0.0/0"],
      egressRules: ["all-all"],
      // ingressCidrBlocks: ["0.0.0.0/0",this.securityGroups.public.securityGroupIdOutput],
      computedIngressWithSourceSecurityGroupId: [{
        "rule": "all-all",
        "source_security_group_id": this.securityGroups.public.securityGroupIdOutput 
      }],
      numberOfComputedIngressWithSourceSecurityGroupId: 1
    })

    this.securityGroups.data = new SecurityGroup(this,`${config.environment}-sg-data`,{
      name: `${config.environment}-sg-data`,
      vpcId: this.vpc.vpcIdOutput,
      ingressWithSelf: [{ rule: "all-all" }],
      egressWithSelf: [{ rule: "all-all" }],
      egressCidrBlocks: ["0.0.0.0/0"],
      egressRules: ["all-all"],
      ingressCidrBlocks: [config.cidr],
      computedIngressWithSourceSecurityGroupId: [{
        "rule": "all-all",
        "source_security_group_id": this.securityGroups.app.securityGroupIdOutput
      }]
    })
 
    const cluster = new ECS(this,{name: "ecs-demo",environment: "dev"}); 
    this.cluster = cluster.ecsCluster

    new dynamodb.DynamodbTable(this,`${config.environment}-dynamodb`,{ 
      name: `${config.project}-${config.environment}`,  
      hashKey: "Environment",
      billingMode: "PAY_PER_REQUEST",
      attribute: [{
        name: "Environment",
        type: "S"
      }]
    })
  }
}    

