import { IsString, IsNotEmpty, IsArray, ArrayMinSize } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class SignMessageDto {
  @ApiProperty({
    description: "The message to be signed",
    example: "Hello, World!",
  })
  @IsString()
  @IsNotEmpty()
  message: string;
}

export class AggregateSignatureDto {
  @ApiProperty({
    description: "The message to be signed by multiple nodes",
    example: "Hello, World!",
  })
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiProperty({
    description: "Array of node IDs that should sign the message",
    example: ["node1", "node2", "node3"],
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  nodeIds: string[];
}
