import { Construct } from "constructs";
import {  TerraformStack, Fn } from "cdktf";
import { SecurityGroup} from "../../.gen/modules/security_group";
import { AwsProvider, ecr, iam, elb, ecs  } from "@cdktf/provider-aws" 

interface PetAppConfig {
  environment: string;
  project: string;
  region: string;
  profile: string;
  publicSubnets: string[];
  vpcId: string;
  image: string;
  cpu: number;
  memory: number;
  containerPort: number;
  clusterId: string;
  hostPort: number;
} 

export default class  PetAppStack extends TerraformStack{ 
  constructor(scope: Construct,name: string,config: PetAppConfig) { 
    super(scope,name)

    new AwsProvider(this,config.environment,{
      region: config.region,
      profile: config.profile, 
    })
    
    new ecr.EcrRepository(this,`${config.environment}-${config.profile}-ecr`,{
      name: `${config.environment}-${config.project}`
    }) 

     const role = new iam.IamRole(this,`${config.environment}-${config.profile}-role`,{  
      name: `${config.environment}-${config.profile}-role`,
      assumeRolePolicy: `{
        "Version": "2008-10-17",
        "Statement": [
          {
            "Sid": "",
            "Effect": "Allow",
            "Principal": {
              "Service": "codebuild.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
          }
        ]
      }`
    })

    new iam.IamRolePolicy(this,`${config.environment}-${config.profile}-role-policy`,{
      name: `${config.environment}-policy`, 
      role: role.id,
      policy: `{
        "Version": "2012-10-17",
        "Statement": [
          {
            "Action": [
              "ecr:GetDownloadUrlForLayer",
              "ecr:BatchGetImage",
              "ecr:BatchCheckLayerAvailability"
            ],
            "Effect": "Allow",
            "Resource": "*"
          }
        ]
      }`
    })

    const securityGroups: { [key: string]: SecurityGroup } = {}; 
    securityGroups.alb = new SecurityGroup(this,`${config.environment}-sp-public`,{ 
      name: `${config.environment}-sp-public`,
      vpcId: config.vpcId,
      ingressWithSelf: [{ rule: "all-all" }],
      egressWithSelf: [{ rule: "all-all" }],
      egressCidrBlocks: ["0.0.0.0/0"],
      egressRules: ["all-all"],
      ingressCidrBlocks: ["0.0.0.0/0"],
      ingressRules: ["https-443-tcp","http-80-tcp"],
    })

    const lb = new elb.Lb(this,`${config.environment}-${config.profile}-lb`,{
      name: `${config.environment}-${config.profile}-lb`,
      loadBalancerType: "application",
      securityGroups: [securityGroups.alb.securityGroupIdOutput],
      subnets: config.publicSubnets
    }) 

    const targetGroup = new elb.LbTargetGroup(this,`${config.environment}-${config.profile}-target-lb`,{
      name: `${config.environment}-${config.profile}-target-lb`,
      port: 80,
      targetType: "ip",
      protocol: "TCP",
      vpcId: config.vpcId
    }) 

    new elb.LbListener(this,`${config.environment}-${config.profile}-forward`,{
      loadBalancerArn: lb.arn,
      port: 80,
      protocol: "HTTP",

      defaultAction: [{
        type: "forward",
        targetGroupArn: targetGroup.arn
      }]
    })

    // @ts-ignore
    const taskDefinition = new ecs.EcsTaskDefinition(this,`${config.environment}-${config.profile}-task-definition`,{ 
      family: config.project,
      requiresCompatibilities: ["FARGATE"],
      networkMode: "awsvpc",
      cpu: Fn.tostring(config.cpu), 
      memory: Fn.tostring(config.memory),
      containerDefinitions: Fn.jsonencode([{
        name: config.project,
        image: config.image,
        cpu: config.cpu, 
        memory: config.memory,
        essential: true,
        portMappings: [
          {
            containerPort: config.containerPort 
          }
        ]
      }]) 
    }) 

    // @ts-ignore
    const service = new ecs.EcsService(this,`${config.environment}-${config.profile}-service`,{ 
      name: config.project,
      cluster: config.clusterId,
      taskDefinition: taskDefinition.arn,
      desiredCount: 1,
      launchType: "FARGATE",
      loadBalancer: [{
        targetGroupArn: targetGroup.arn,
        containerName: config.project,
        containerPort: config.containerPort
      }]
    }) 
  } 
}

